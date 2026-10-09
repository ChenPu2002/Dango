/* Node 测试钩子：在 register.mjs 的基础上把 src/api.js 重定向到 mock-llm
 * 用法：node --import ./scripts/register-mockllm.mjs scripts/test-memory-flow.mjs */
import { register } from 'node:module';
register('./loader-mockllm.mjs', import.meta.url);
