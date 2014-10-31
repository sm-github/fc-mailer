/**
 * firecracker-mailer
 * 
 * A module that handles the low-level details of rendering and
 * sending system emails.
 **/

var async           = require('async');
var path			= require("path");
var nodemailer		= require("nodemailer");
var emailTemplates	= require('swig-email-templates');
var swig			= require('swig');


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
    this._transport = nodemailer.createTransport({
    	service: config.service,
    	auth: config.auth
    });
    this._emailTemplatesDir = config.templateDir;
    this._isTest = config.isTest || false;
    this._testEnabledEmails = config.testEnabledEmails || [];
    
    //Setup stuff we'll ask for later
    this._lastHTML = null;
    this._lastText = null;
};
Mailer.prototype.constructor = Mailer;

//Export this class.
module.exports = Mailer;

Mailer.prototype.send = function (recipient, templateName, data, callback) {
    
    //Clean up the data here
    data = _prepareData(data);
	
	var results = {
	    sent: 0,
	    failed: []
	};
	
	_renderMessage(templateName, data, function(err, html, text) {

		_sendMessage(data.recipient, data.subject, html, text, function(err) {
		    if (err) results.failed.push(data.recipient);
		    else resulst.sent++;
			
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
    
    //Clean up the data here
    data = _prepareData(data);
	
	var results = {
	    sent: 0,
	    failed: []
	};
	
	_renderMessage(templateName, data, function(err, html, text) {
		
		async.each(recipients,
			function (recipient, next) {
			    
				_sendMessage(data.recipient, data.subject, html, text, function(err) {
				    if (err) results.failed.push(data.recipient);
				    else resulst.sent++;
					
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
    //TODO: implement
    
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
var _renderMessage = function (templateName, data, callback) {

	if (!config.isLiveSite()) {
		console.log("Mailer.renderMessage()");
	}
	
	//Insert the site config into the data.
	data.config = config;
	data.cssPath = path.resolve(_emailTemplatesDir, "style.css");

	Mailer._renderHTML(templateName, data, function (err, html) {
		if (err) return callback(err, null, null);
		
		//Generate Text
		Mailer._renderText(templateName, data, function (err, text) {
			if (err) {
				console.error("Error loading text:", err);
				return callback(err, null, null);
			}
			
			//Success!
			_lastHTML = html;
			_lastText = text;
			callback(null, html, text);
		});
	});

}; //Mailer.renderMessage()

/**
 * Render the HTML version of a template.
 */
var _renderHTML = function (templateName, data, callback) {
	var templatePath = templateName+"/html.swig";	//relative path

	//Prepare the swig-email-templates module
	var templateOptions = {
		root: _emailTemplatesDir
	};
	emailTemplates(templateOptions, function (err, render) {

		if (err) {
			console.error("Error initializing template module:", err);
			return callback(err, null);
		}
		
		//Create the template
		render(templatePath, data, function (err, html) {
			if (err) {
				console.error("Error loading template:", err);
				callback(err, null);
			} else {
				callback(null, html);
			}
		});
	});
};

/**
 * Render the text version of a template.
 */
var _renderText = function (templateName, data, callback) {
	var templatePath = path.resolve(_emailTemplatesDir, templateName, "text.swig");	//absolute path
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
var _sendMessage = function (toEmail, subject, html, text, options, callback) {

	if (!config.isLiveSite()) {
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
	if (!config.isLiveSite() && !Mailer._isTestEnabled(toEmail)) {
		console.log("["+toEmail+" is not a test-enabled address. The message will not be sent.]");
		return callback(null);
	}

	//Load options
	var sendOptions = Mailer._loadSendOptions(toEmail, subject, html, text, options);

	//Send the email.
	_transport.sendMail(sendOptions, function (err, responseStatus) {
		if (err) {
			console.log("Error: ", err, responseStatus);
		}
		callback(err);
	});

};	//Mailer.sendMessage()


/***************
 * OTHER STUFF */

var _loadSendOptions = function (toEmail, subject, html, text, options) {

	//Start with the defaults
	var sendOptions = {
		from: _systemEmail,
		to: toEmail,
		subject: subject,
		html: html,
		text: text
	};

	//Put in special fields
	if (options.headers) {
		options.headers = Mailer._serializeHeaders(options.headers);
	}
	for (var key in options) {
		sendOptions[key] = options[key];
	}

	return sendOptions;
};

var _serializeHeaders = function (headers) {
	var result = "";
	for (var key in headers) {
		result += key + ": " + headers[key] + "\n";
	}
	return result;
};

var _isTestEnabled = function (email) {
	for (var i = 0; i < _testEnabledEmails.length; i++) {
		if (_testEnabledEmails[i] == email) {
			return true;
		}
	}
	return false;
};