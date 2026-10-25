import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',testMatch:'ui-review-fixes.spec.ts',workers:1,timeout:90000,
  expect:{timeout:15000},
  use:{baseURL:'http://localhost:5091',screenshot:'only-on-failure'},
  projects:[
    {name:'desktop-edge',use:{browserName:'chromium',channel:'msedge',viewport:{width:1440,height:1000}}},
    {name:'phone-webkit',use:{browserName:'webkit',viewport:{width:390,height:844},isMobile:true,hasTouch:true}},
  ],
});
