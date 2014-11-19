fc-mailer
=========

The Firecracker Mailer handles rendering and sending emails.

Example
=======

```
var Mailer = require('firecracker-mailer');

var adminMailer = new Mailer({
	fromName: 'Example Website',
	fromAddress: 'system@example.com',
	service: 'Mandrill',
	auth: {
		user: 'username@example.com',
		pass: 'MANDRILL_API_KEY'
	},
	templateDir: 'templates/emails'
});

var context = {
	email: 'user@example.com',
	name: 'John Smith',
	profileUrl: 'http://example.com/profile/john-smith'
};
adminMailer.send('user@example.com', 'welcome', context, function (err) {
	if (err) {
		console.log("Error!");
	} else {
		console.log("Success!");
	}
});
```

License
=======

MIT