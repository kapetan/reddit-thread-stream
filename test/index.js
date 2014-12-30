var qs = require('querystring');

var test = require('tape');
var nock = require('nock');
var sequence = require('after-sequence');
var open = require('opn');
var promptly = require('promptly');
var eos = require('end-of-stream');
var concat = require('concat-stream');
var pump = require('pump');

var reddit = require('../');

var server, solve, user = {};
var env = process.env;

var errorMessage = function(err) {
	return err ? err.message : 'No error';
};

var selftext = function(id, callback) {
	reddit.api.get('/r/funny/comments/' + id + '/my_thread.json', function(err, response) {
		if(err) return callback(err);
		response = response[0].data.children[0].data.selftext;
		callback(null, response);
	});
};

if(env.REDDIT_USERNAME && env.REDDIT_PASSWORD) {
	user.username = env.REDDIT_USERNAME;
	user.password = env.REDDIT_PASSWORD;

	solve = function(captcha, callback) {
		open(captcha.url);
		promptly.prompt('Captcha: ', {
			validator: function(value) {
				if(!value.length) throw new Error('Solution required');
				return value.toUpperCase();
			}
		}, callback);
	};
} else {
	user.username = 'test_user';
	user.password = 'test_password';

	solve = function(captcha, callback) {
		callback(null, 'test_captcha_solution');
	};

	server = nock(reddit.api.defaults.baseUrl)
		.post('/api/login', qs.stringify({
			user: user.username,
			passwd: user.password,
			rem: true,
			api_type: 'json'
		}))
		.times(2)
		.reply(200, {
			json: {
				errors: [],
				data: {
					need_https: false,
					modhash: 'test_modhash',
					cookie: 'test_cookie'
				}
			}
		})
		.post('/api/new_captcha')
		.times(3)
		.reply(200, {
			json: {
				errors: [],
				data: {
					iden: 'test_captcha_id'
				}
			}
		})
		.post('/api/submit', qs.stringify({
			kind: 'self',
			sendreplies: false,
			sr: 'funny',
			title: 'My thread',
			text: 'Hello thread',
			captcha: 'test_captcha_solution',
			iden: 'test_captcha_id',
			api_type: 'json'
		}))
		.reply(200, {
			json: {
				errors: [],
				data: {
					url: 'http://www.reddit.com/r/funny/comments/test_thread_id/my_thread',
					id: 'test_thread_id',
					name: 't3_test_thread_id'
				}
			}
		})
		.get('/r/funny/comments/test_thread_id/my_thread.json')
		.reply(200, [{
			kind: 'Listing',
			data: {
				modhash: 'test_modhash',
				children: [
					{
						kind: 't3',
						data: {
							domain: 'self.funny',
							subreddit: 'funny',
							title: 'My thread',
							selftext: 'Hello thread'
						}
					}
				]
			}
		}])
		.post('/api/editusertext', qs.stringify({
			thing_id: 't3_test_thread_id',
			text: 'Bye thread',
			api_type: 'json'
		}))
		.reply(200, {
			json: {
				errors: [],
				data: {
					things: [
						{
							kind: 't3',
							data: {
								id: 't3_test_thread_id',
								content: '<div>Bye thread</div>'
							}
						}
					]
				}
			}
		})
		.get('/r/funny/comments/test_thread_id/my_thread.json')
		.reply(200, [{
			kind: 'Listing',
			data: {
				modhash: 'test_modhash',
				children: [
					{
						kind: 't3',
						data: {
							domain: 'self.funny',
							subreddit: 'funny',
							title: 'My thread',
							selftext: 'Bye thread'
						}
					}
				]
			}
		}])
		.get('/captcha/test_captcha_id')
		.reply(200, function() {
			return new Buffer(32);
		});
}

test('create and update thread', function(t) {
	var captcha, name, id;
	var next = sequence(function() {
		t.end();
	});

	next(function(callback) {
		reddit.captchaUrl(function(err, result) {
			t.notOk(err, errorMessage(err));

			captcha = result;
			callback();
		});
	});

	next(function(callback) {
		solve(captcha, function(err, solution) {
			t.notOk(err, errorMessage(err));

			captcha.solution = solution;
			callback();
		});
	});

	next(function(callback) {
		var thread = reddit(user, {
			captcha: captcha,
			title: 'My thread',
			subreddit: 'funny'
		});

		thread.on('create', function(data) {
			id = data.id;
			name = data.name;

			t.equal(data.subreddit, 'funny');
			t.equal(data.title, 'My thread');
			t.equal(data.url, reddit.api.url('/r/funny/comments/' + id + '/my_thread'));
		});

		eos(thread, function(err) {
			t.notOk(err, errorMessage(err));
			callback();
		});

		thread.end('Hello thread');
	});

	next(function(callback) {
		selftext(id, function(err, text) {
			t.notOk(err, errorMessage(err));
			t.equal(text, 'Hello thread');

			callback();
		});
	});

	next(function(callback) {
		var thread = reddit(user, id);

		eos(thread, function(err) {
			t.notOk(err, errorMessage(err));
			callback();
		});

		thread.end('Bye thread');
	});

	next(function(callback) {
		selftext(id, function(err, text) {
			t.notOk(err, errorMessage(err));
			t.equal(text, 'Bye thread');

			callback();
		});
	});
});

test('captcha url', function(t) {
	reddit.captchaUrl(function(err, captcha) {
		t.notOk(err, errorMessage(err));
		t.ok(captcha.id);
		t.ok(captcha.url);

		t.end();
	});
});

test('captcha stream', function(t) {
	var stream = reddit.captchaStream();
	var sink = concat(function(data) {
		t.ok(data.length > 0);
	});

	pump(stream, sink, function(err) {
		t.notOk(err, errorMessage(err));
		t.end();
	});
});

if(server) {
	test('all mocks called', function(t) {
		t.ok(server.isDone(), server.pendingMocks());
		t.end();
	})
}
