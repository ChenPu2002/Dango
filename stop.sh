#!/bin/bash
pkill -f "node server.js" 2>/dev/null
pkill -f "cli.js" 2>/dev/null
echo "已停止全部服务"
