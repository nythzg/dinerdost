import {defineConfig} from '@playwright/test';
import base from './playwright.config';

const {channel:_,...use}=base.use??{};
export default defineConfig({...base,use,
  testMatch:['calculator-password.spec.ts','kot-history.spec.ts','header-navigation.spec.ts','ecosystem-responsive.spec.ts','activity-dropdowns.spec.ts','guest-checkout.spec.ts','support-notifications.spec.ts','support-composer.spec.ts','messages-panel.spec.ts','support-live.spec.ts','pos-table-context.spec.ts','nearest-rounding.spec.ts','light-header.spec.ts'],
  timeout:600000,
  projects:[
    {name:'chromium-mobile',use:{browserName:'chromium',channel:'msedge',hasTouch:true}},
    {name:'webkit-mobile',use:{browserName:'webkit',isMobile:true,hasTouch:true,deviceScaleFactor:2}},
  ],
});
