# reddit-thread-stream

A writable stream for updating reddit self threads.

	npm install reddit-thread-stream

# Usage

The constructor accepts the credentials as first argument, and either an options map, used to create a new self thread, or the id (or fullname) of an existing thread.

Use `reddit.captchaUrl(callback)` or `reddit.captchaStream()` to get a captcha instance. The first method passes a possible error and an options map with the captcha `id` and `url` to given callback, while the second method returns a stream (with `id` and `url` properties) containing the actual captcha image.

```javascript
var reddit = require('reddit-thread-stream');

var thread = reddit({
	username: 'test_username',
	password: 'test_password'
}, {
	subreddit: 'funny',
	title: 'My thread',
	captcha: {
		id: 'RansUtzrqG3sgGx0NT7SwQpZ39oeGagB',
		solution: 'ffvwso'
	}
});

thread.on('create', function(data) {
	console.log(data.url);
});

// Thread is created on first write
thread.write('First update');

// Overrides the previous text in the thread
thread.write('Second update');

thread.end();
```

Updating an existing thread using the fullname.

```javascript
var thread = reddit({
	username: 'test_username',
	password: 'test_password'
}, 't3_23l21y');

thread.end('Third update');
```

The `set` method can be used to provide thread options after the creation of an instance.

```javascript
var thread = reddit(credentials);

// Call before the first write
thread.set('t3_23l21y');
```
