const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

// подключаемся к redis
const subscriber = require('redis').createClient({
  host: 'redis',
  port: 6379,
  password: 'eustatos'
});

// подписываемся на изменения в каналах redis
subscriber.on('message', function(channel, message) {
  // пересылаем сообщение из канала redis в комнату socket.io
  io.emit('eustatosRoom', message);
});

// открываем соединение socket.io
io.on('connection', function(socket){
  // подписываемся на канал redis 'eustatos' в callback
  subscriber.subscribe('eustatos');
});

const port = process.env.PORT || 5000;

http.listen(
  port,
  function() {
    console.log('Listen at ' + port);
  }
);
