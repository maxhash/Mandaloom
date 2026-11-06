import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',use:{channel:process.env.PLAYWRIGHT_CHANNEL,baseURL:'http://localhost:3000'},webServer:{command:'npm run dev',url:'http://localhost:3000',reuseExistingServer:true},workers:1});

