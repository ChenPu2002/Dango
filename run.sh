#!/bin/bash
# 一键启动心力球 Demo（后台 + 心力球模拟 + 电脑 agent）
cd "$(dirname "$0")"
pkill -f "node server.js" 2>/dev/null; pkill -f "cli.js" 2>/dev/null; sleep 0.5
nohup node server.js > /tmp/xinli-server.log 2>&1 & disown
sleep 1
nohup node cli.js ball > /tmp/xinli-ball.log 2>&1 & disown
nohup node cli.js start --name "小满的 MacBook" > /tmp/xinli-pc.log 2>&1 & disown
sleep 3
IP=$(ipconfig getifaddr en0 2>/dev/null)
echo ""
echo "✅ 已启动"
echo "   本机测试:   http://localhost:8000"
echo "   手机测试:   http://${IP:-<电脑IP>}:8000   (需同一 WiFi)"
echo ""
echo "   停止: ./stop.sh    查看设备: node cli.js status"
