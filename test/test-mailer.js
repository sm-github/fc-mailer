var mailer = require('../lib/mailer');
var assert = require('assert');

describe('Mailer', function () {
	
	describe('test-mocha', function () {
		
		it('should pass', function () {
		});
	});

	describe('rendering html and text', function () {
		var testTransport = {
			sendMail : function(sendOptions, callback) {
				callback(null, 200);//function (err, responseStatus)
			}
		};

		var config = {
			
			auth: true,
			isTest: true,
			protocol: "SMTP",
			service: "Mandrill",
			fromName: "testName",
			fromAddress: "fromAddress@email.test",
			templateDir: "../test",
			transport: testTransport

		}

		var m = new mailer(config);

		it('should render the correct html and txt', function(done) {

			var templateName = "testEmail";
			var data = {
				words: "these are words going into the email"
			};

			m._renderMessage(templateName, data, function (err, html, text) {

				// console.log('\nhtml\n' + html + '\ntext\n' + text);
				assert(!err, 'error rendering message' + err);
				assert(html == '<html><body><h1>This is the test text!</h1> ' + data.words + '\n</body></html>', 'html looks wrong');
				assert(text == 'This is the test text! ' + data.words, 'text looks wrong');

				done();
			});
		});


	});
});