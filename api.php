<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache');

$url = 'https://toryumon.is-neat-mnt.com/api/rankings';
$json = @file_get_contents($url);

if ($json === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Failed to fetch rankings']);
    exit;
}

echo $json;
