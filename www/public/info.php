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
