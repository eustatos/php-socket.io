# Socket.io, redis и php

Для передачи данных сервером на php клиенту можно использовать следующий алгоритм:
1. Сервер php публикует данные в канал redis.
2. Сервер node подписывается на события в соответствующем канале redis и при
   наступлении события поступления данных публикует эти данные уже в
   socket.io
3. Клиент подписывается на сообщения socket.io и обрабатывает их при поступлении

Исходный код проекта можно найти в репозитории.

Создание docker-контейнера
Здесь я буду двигаться очень маленькими шагами.
В проекте будет использоваться связка nginx и php-fpm и начну я с настройки
nginx.

## Настройка nginx
Начнем создавать `docker-compose.yml` в корневой папке нашего проекта.
```yml
# docker-compose.yml
version: '3'
services:
  nginx:
    image: nginx
    ports:
      - 4400:80
```

Откроем в браузере: `http://localhost:4400` и увидим стандартное приветствие
nginx.
Теперь настроим, чтобы nginx отдавал статическое содержимое папки
`./www/public`.
Сначала создадим папки
```bash
mkdir -pv www/public
```

Создадим файл `./www/pulbic/index.html`
```html
<!-- www/public/index.html -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title></title>
  </head>
  <body>
    <h1>Hello World!</h1>
  </body>
</html>
```
Создадим файл конфигурации nginx - `nginx/conf/custom.conf`. Для начала
скопируем стандартный `/etc/nginx/conf.d/default.conf`.
Изменим `docker-compose.yml`
```diff
 services:
   nginx:
     image: nginx
+    volumes:
+      - ./nginx/conf/custom.conf:/etc/nginx/conf.d/default.conf
     ports:
       - 4400:80
```
Пересоздадим контейнер nginx
```bash
docker-compose up -d
```
И вновь наблюдаем по в браузере по адресу `http://localhost:4400` стандартное
приветствие nginx.
Внесем изменения
`docker-compose.yml`
```diff
     image: nginx
     volumes:
       - ./nginx/conf/custom.conf:/etc/nginx/conf.d/default.conf
+      - ./www:/www
     ports:
       - 4400:80
```
`nginx/conf/custom.conf`
```diff
 #access_log  /var/log/nginx/host.access.log  main;

   location / {
-    root   /usr/share/nginx/html;
+    root   /www/public;
     index  index.html index.htm;
   }
 ```
 Теперь по адресу `http://localhost:4400` отображается 'Hello World!' из файла
 `www/public/index.html`.
 Прорывом это назвать сложно, но мы определенно двигаемся в нужном направлении.

## Настройка php
Начнем с создания папок для хранения файлов настроек контейнера.
```bash
mkdir -pv php/conf
```
Далее создадим `php/Dockerfile`
```
FROM php:7-fpm

RUN apt-get -qq update && apt-get -qq install \
  curl \
  > /dev/null

ENV PHPREDIS_VERSION 3.0.0

RUN mkdir -p /usr/src/php/ext/redis \
    && curl -L https://github.com/phpredis/phpredis/archive/$PHPREDIS_VERSION.tar.gz | tar xvz -C /usr/src/php/ext/redis --strip 1 \
    && echo 'redis' >> /usr/src/php-available-exts \
    && docker-php-ext-install redis
```
И внесем изменения в `docker-compose.yml`
```diff
       - ./www:/www
     ports:
       - 4400:80
+  php:
+    build: ./php
+    volumes:
+      - ./www:/www
```
Также нам нужно внести изменения в настройки nginx, чтобы файлы с расширением
`.php` обрабатывались `php-fpm`.
Изменим файл `nginx/conf/custom.conf` следующим образом
```diff
 # pass the PHP scripts to FastCGI server listening on 127.0.0.1:9000
 #
-#location ~ \.php$ {
-#    root           html;
-#    fastcgi_pass   127.0.0.1:9000;
-#    fastcgi_index  index.php;
-#    fastcgi_param  SCRIPT_FILENAME  /scripts$fastcgi_script_name;
-#    include        fastcgi_params;
-#}
+location ~ \.php$ {
+    root          /www;
+    fastcgi_pass   php:9000;
+    fastcgi_index  index.php;
+    fastcgi_param REQUEST_METHOD  $request_method;
+    fastcgi_param CONTENT_TYPE    $content_type;
+    fastcgi_param CONTENT_LENGTH  $content_length;
+    fastcgi_param  SCRIPT_FILENAME  /www/public/$fastcgi_script_name;
+    include        fastcgi_params;
+}
```
Осталось создать файл `www/public/info.php` со следующим кодом
```php
<?php
phpinfo();
```
Перезапустим наш контейнер
```bash
docker-compose restart
```
И теперь по адресу `http://localhost:4400/info.php` отображается информация о
настройках php.
Еще немного поэкспериментируем и создадим файл `www/Test.php`
```php
<?php
class Test
{
  public function prn()
  {
    echo 'Success';
  }
}
```
А содержимое файла `www/public/info.php` заменим на следующее:
 ```php
<?php
require_once(
  implode(
    DIRECTORY_SEPARATOR,
    [
      dirname(__DIR__),
      'Test.php'
    ]
  )
);

$test = new Test();
$test->prn();
```

Теперь по адресу `http://localhost:4400/info.php` отображается 'success', а это
означает,что `php-fpm` доступны скрипты расположенные в папке `www`, а через
браузер они недоступны. Т.е. мы продолжаем двигаться в нужном направлении.

## Настройка redis
Это, пожалуй, самая короткая часть.
Redis в этом проекте не будет доступен из внешней сети, но защиту паролем
настроим.
Для этого создадим файл `.env`
```
REDIS_PASSWORD=eustatos
```
Внесем изменения в `docker-compose.yml`
```diff
     build: ./php
     volumes:
       - ./www:/www
+  redis:
+    image: redis
+    command: ["sh", "-c", "exec redis-server --requirepass \"${REDIS_PASSWORD}\""]
```
Чтобы протестировать подключение к redis изменим файл `www/public/info.php`
```php
<?php
$redis = new Redis();
// подключаемся к серверу redis
$redis->connect(
  'redis',
  6379
);
// авторизуемся. 'eustatos' - пароль, который мы задали в файле `.env`
$redis->auth('eustatos');
// публикуем сообщение в канале 'eustatos'
$redis->publish(
  'eustatos',
  json_encode([
    'test' => 'success'
  ])
);
// закрываем соединение
$redis->close();
```
Рестартуем контейнер
```
docker-compose restart
```
Теперь подключимся к серверу redis
```
docker-compose exec redis bash
```
Перейдем к командной строке. 'eustatos' - пароль, который мы ранее задали в
файле `.env`
```
# redis-cli -a eustatos
```
Подпишемся на канал 'eustatos' (название произвольное, чтобы все работало,
долно совпадать с названием канала, которое мы определили в файле
`www/public/info.php`)
```
> subscribe eustatos
```
После всех этих приготовлений, переходим в браузере по адресу
`http://localhost:4400/info.php` и наблюдаем, как в терминале, где мы
подключались к redis появляются примерно следующие строки:
```
1) "message"
2) "eustatos"
3) "{\"test\":\"success\"}"
```
Значит мы стали еще ближе к нашей цели.

## Настройка socket.io
Созадим папку, где будут лежать файлы нашего socket.io сервера
```bash
mkdir socket
```
Внесем изменения в `docker-compose.yml`
```diff
   redis:
     image: redis
     command: ["sh", "-c", "exec redis-server --requirepass \"${REDIS_PASSWORD}\""]
+  socket:
+    image: node
+    user: "node"
+    volumes:
+      - ./socket:/home/node/app
+    ports:
+      - 5000:5000
+    working_dir: /home/node/app
+    command: "npm start"
```
Перейдем в папку `socket`
```
cd socket
```
Установим необходимые пакеты
```
npm init -y
npm i -S socket.io redis express
```
После этого добавим в файл `socket/package.json` строки
```diff
{
  "name": "socket-php-example",
  "version": "1.0.0",
  "main": "index.js",
  "author": "eustatos <astashkinav@gmail.com>",
  "license": "MIT",
+  "scripts": {
+    "start": "node index.js"
+  },
  "dependencies": {
    "express": "^4.16.3",
    "redis": "^2.8.0",
    "socket.io": "^2.1.0"
  }
}
```
Создадим файл `socket/index.js`
```javascript
const express = require('express');
const app = express();
const http = require('http').Server(app);

const port = process.env.PORT || 5000;

app.get(
  '/',
  function(req, res, next) {
    res.send('success');
  }
);

http.listen(
  port,
  function() {
    console.log('Listen at ' + port);
  }
);
```
Перезапустим наш контейнер
```
docker-compose restart
```
После этого в браузере по адресу `http://localhost:5000` отображается "success".
Значит мы еще чуть ближе к нашей цели. Осталось совсем немного.
Изменим файл `socket/index.js`
```javascript
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
```
На этом настройка контейнера socket.io завершена.

## Настройка клиентского приложения
Клиентское приложение можно развернуть в любом из наших контейнеров, но
для чистоты эксперимента развернем его в отдельном контейнере.
Файлы клиентского приложения разместим в папке `client`
```
mkdir client
```
Создадим файл `client/index.html`
```
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title></title>
  </head>
  <body>
      <script
         src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/1.7.3/socket.io.min.js"></script>
      <script>
const socket = io(
  window.location.protocol + '//' + window.location.hostname + ':5000'
);
        socket.on(
          'eustatosRoom',
          function(message) {
            console.log(JSON.parse(message));
          }
        );
      </script>
  </body>
</html>
```
Изменим `docker-compose.yml`
```diff
     ports:
       - 5000:5000
     command: "npm start"
+  client:
+    image: nginx
+    volumes:
+      - ./client:/usr/share/nginx/html
+    ports:
+      - 8000:80
```
Перезапустим наш контейнер
```
docker-compose restart
```
Откроем сначала в браузере `http://localhost:8000`. Для демонстрации результата
наших трудов нужно открыть панель разработчика.
Пока ничего не отображается.
Откроем в другой вкладке или окне адрес `http://localhost:5000` и посмотрем на
в консоль нашего клиента. Мы должны увидеть:
```
{test: "success"}
```
А это значит, что наш сервер благополучно передал клиентскому приложению данные.


