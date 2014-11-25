/**
 * firecracker-mailer
 * 
 * A module that handles the low-level details of rendering and
 * sending system emails.
 **/

var async           = require('async');
var path			= require('path');
var nodemailer		= require('nodemailer');
var smtpTransport	= require('nodemailer-smtp-transport');
var SwigEmails		= require('swig-emails');
var swig			= require('swig');

_enabled = true;


///////////////////////
// MAIN INTERFACE
///////////////////////

var Mailer = function (config) {
	//Validate input...
	if (!config.fromName || !config.fromAddress) throw new Error("Must set fromName and fromAddress");
	if (!config.service || !config.auth) throw new Error("Must set service and auth");
	if (!config.templateDir) throw new Error("Must set templateDir");
	
	//Setup config...
	
	this._systemEmail = config.fromName + " <"+config.fromAddress+">"; //The address to mail from

	if (config.isTest && config.transport) {
		this._transport = config.transport;
	} else {
		this._transport = nodemailer.createTransport(smtpTransport({
			service: config.service,
			auth: config.auth
		}));
	}

	this._emailTemplatesDir = config.templateDir;
	this._isTest = config.isTest || false;
	this._testEnabledEmails = config.testEnabledEmails || [];

	//Setup stuff we'll ask for later

	this._swigEmails = new SwigEmails({
		root: this._emailTemplatesDir
	});

	this._lastHTML = null;
	this._lastText = null;
};
Mailer.prototype.constructor = Mailer;

Mailer.prototype.send = function (recipient, templateName, data, callback) {
	var thisMailer = this;

	//Clean up the data here
	data = thisMailer._prepareData(data);
	
	var results = {
		sent: 0,
		failed: []
	};

	thisMailer._renderMessage(templateName, data, function(err, html, text) {

		thisMailer._sendMessage(recipient, data.subject, html, text, function(err) {
			if (err) results.failed.push(data.recipient);
			else results.sent++;
			
			callback(err, results);
		});
	});
};

/**
 * Send an email to a group of recipients.
 * 
 * @param {Array} recipients
 * @param {Object} data
 * @param {function} callback(err, results)
 */
Mailer.prototype.sendGroup = function(recipients, templateName, data, callback) {
	var thisMailer = this;

	//Clean up the data here
	data = thisMailer._prepareData(data);

	var results = {
		sent: 0,
		failed: []
	};

	thisMailer._renderMessage(templateName, data, function(err, html, text) {
		
		async.each(recipients,
			function (recipient, next) {
				
				thisMailer._sendMessage(recipient, data.subject, html, text, function(err) {
					if (err) results.failed.push(recipient);
					else results.sent++;
					
					if (err && data.abortOnError) return next(err);
					
					next(null);
				});
			},
			function (err) {
				callback(err, results);
			}
		);
	});
};

Mailer.prototype.setGlobalData = function (globalData) {
	
};

Mailer.setEnabled = function(enabledOrNot) {
	_enabled = enabledOrNot;
};

Mailer.prototype.getLastHTML = function() {
	return this._lastHTML;
};

Mailer.prototype.getLastText = function() {
	return this._lastText;
};

///////////////////
// HELPERS
///////////////////

Mailer.prototype._prepareData = function (data) {
	data = data || {};
	
	//TODO: implement

	//Insert the site config into the data.
	data.cssPath = path.resolve(this._emailTemplatesDir, "style.css");
	
	//TODO: merge with global data, so we always have homeUrl, etc.
	
	return data;
};

/**
 * Render an EJS email template, 
 * Populating it with data,
 * and return it through a callback function.
 * 
 * callback = function(err, html, text)
 */
Mailer.prototype._renderMessage = function (templateName, data, callback) {

	if (this._isTest) {
		console.log("Mailer.renderMessage()");
	}

	var thisMailer = this;

	thisMailer._renderHTML(templateName, data, function (err, html) {
		if (err) return callback(err, null, null);
		
		//Generate Text
		thisMailer._renderText(templateName, data, function (err, text) {
			if (err) {
				console.error("Error loading text:", err);
				return callback(err, null, null);
			}
			
			//Success!
			thisMailer._lastHTML = html;
			thisMailer._lastText = text;
			callback(null, html, text);
		});
	});

}; //Mailer.renderMessage()

/**
 * Render the HTML version of a template.
 */
Mailer.prototype._renderHTML = function (templateName, data, callback) {
	var templatePath = templateName+"/html.swig";	//relative path

	var renderOptions = {
		context: data,
		text: false	//don't render text here - we'll do that ourselves.
	};

	this._swigEmails.render(templatePath, renderOptions, function (err, html) {
		if (err) {
			console.error("Error loading template:", err);
			callback(err, null);
		} else {
			callback(null, html);
		}
	});
};

/**
 * Render the text version of a template.
 */
Mailer.prototype._renderText = function (templateName, data, callback) {
	var templatePath = path.resolve(this._emailTemplatesDir, templateName, "text.swig");	//absolute path
	swig.renderFile(templatePath, data, function (err, output) {
		callback(err, output);
	});
};

/**
 * Send a message with a specific recipient, subject, and body.
 *
 * @param {Object} options (optional) extra values to set in the message.
 * @param {Function} callback = function(err)
 */
Mailer.prototype._sendMessage = function (toEmail, subject, html, text, options, callback) {

	if (this._isTest) {
		console.log("Mailer.sendMessage(\"" + toEmail + "\",\"" + subject + "\", ...)");
	}

	//Configure parameters.
	if (!callback && typeof options == "function") {
		//options parameter not specified.
		callback = options;
		options = {};
	}

	//Cancel sending?
	if (!_enabled) {
		console.log("[Note: Mailer disabled. The message will not be sent.]");
		return callback(null);
	}
	if (this._isTest && !this._isTestEnabled(toEmail)) {
		console.log("["+toEmail+" is not a test-enabled address. The message will not be sent.]");
		return callback(null);
	}

	//Load options
	var sendOptions = this._loadSendOptions(toEmail, subject, html, text, options);

	//Send the email.
	this._transport.sendMail(sendOptions, function (err, responseStatus) {
		if (err) {
			console.log("Error: ", err, responseStatus);
		}
		callback(err);
	});

};	//Mailer.sendMessage()


Mailer.prototype._loadSendOptions = function (toEmail, subject, html, text, options) {

	//Start with the defaults
	var sendOptions = {
		from: this._systemEmail,
		to: toEmail,
		subject: subject,
		html: html,
		text: text
	};

	//Put in special fields
	if (options.headers) {
		options.headers = _serializeHeaders(options.headers);
	}
	for (var key in options) {
		sendOptions[key] = options[key];
	}

	return sendOptions;
};

Mailer.prototype._isTestEnabled = function (email) {
	for (var i = 0; i < this._testEnabledEmails.length; i++) {
		if (this._testEnabledEmails[i] == email) {
			return true;
		}
	}
	return false;
};


/***************
 * OTHER STUFF */

var _serializeHeaders = function (headers) {
	var result = "";
	for (var key in headers) {
		result += key + ": " + headers[key] + "\n";
	}
	return result;
};



//Export this class.
module.exports = Mailer;