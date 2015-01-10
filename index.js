var stream = require('stream');
var util = require('util');

var reddit = require('redditor');
var thunky = require('thunky');
var pump = require('pump');

var validate = function(thread) {
	var errors = [];
	var assert = function(ok, message) {
		if(!ok) errors.push(new Error(message));
	};

	assert(thread, 'Missing thread data');
	assert(thread.captcha && thread.captcha.id && thread.captcha.solution, 'Missing captcha');
	assert(thread.subreddit, 'Missing subreddit');
	assert(thread.title, 'Missing title');

	return errors;
};

var id = function(thread) {
	var name = (typeof thread === 'string') ? thread : (thread.id || thread.name);
	if(name && !/^t3_/.test(name)) name = 't3_' + name;
	return name;
};

var RedditThreadStream = function(credentials, thread) {
	if(!(this instanceof RedditThreadStream)) return new RedditThreadStream(credentials, thread);
	stream.Writable.call(this, { objectMode: true, highWaterMark: 16 });

	this._thread = null;
	this._id = null;
	this._destroyed = false;
	this._login = thunky(function(callback) {
		reddit(credentials, callback);
	});

	if(thread) this.set(thread);
};

util.inherits(RedditThreadStream, stream.Writable);

RedditThreadStream.api = reddit;

RedditThreadStream.captchaStream = function() {
	var pass = new stream.PassThrough();

	RedditThreadStream.captchaUrl(function(err, captcha) {
		if(err) return pass.emit('error', err);

		pass.url = captcha.url;
		pass.id = captcha.id;

		pass.emit('captcha', captcha);

		var response = reddit.get(captcha.url);
		pump(response, pass);
	});

	return pass;
};

RedditThreadStream.captchaUrl = function(callback) {
	reddit.post('/api/new_captcha', function(err, response) {
		if(err) return callback(err);
		var id = response.json.data.iden;

		callback(null, {
			url: reddit.url('/captcha/' + id),
			id: id
		});
	});
};

RedditThreadStream.prototype.set = function(thread) {
	this._thread = thread;
	this._id = id(thread);
};

RedditThreadStream.prototype.destroy = function() {
	if(this._destroyed) return;
	this._destroyed = true;
	this.emit('close');
};

RedditThreadStream.prototype._write = function(data, encoding, callback) {
	var self = this;

	this._login(function(err, authorized) {
		if(err) return callback(err);

		if(!self._id) return self._createThread(authorized, data, callback);
		self._updateThread(authorized, data, callback);
	});
};

RedditThreadStream.prototype._updateThread = function(authorized, text, callback) {
	authorized.post('/api/editusertext', {
		thing_id: this._id,
		text: text
	}, callback);
};

RedditThreadStream.prototype._createThread = function(authorized, text, callback) {
	var self = this;
	var thread = this._thread;
	var errors = validate(thread);

	if(errors.length) return callback(errors[0]);

	authorized.post('/api/submit', {
		kind: 'self',
		sendreplies: !!thread.sendreplies,
		sr: thread.subreddit,
		title: thread.title,
		text: text,
		captcha: thread.captcha.solution,
		iden: thread.captcha.id
	}, function(err, response) {
		if(err) return callback(err);
		response = response.json.data;

		self._id = response.name;
		self.emit('create', {
			id: response.id,
			name: response.name,
			url: response.url,
			subreddit: thread.subreddit,
			title: thread.title
		});

		callback();
	});
};

module.exports = RedditThreadStream;
