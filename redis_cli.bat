@echo off
cd /d %~dp0
tools\redis\redis-cli.exe -u redis://default:ET3y4uPPWCXJ3YILwk3ertCZUIeklV5F@high-crate-spoon-92916.db.redis.io:18602 %*
