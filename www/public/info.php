<?php
$redis = new Redis();
$redis->connect(
  'redis',
  6379
);
$redis->auth('eustatos');
$redis->publish(
  'eustatos',
  json_encode([
    'test' => 'success'
  ])
);

$redis->close();
