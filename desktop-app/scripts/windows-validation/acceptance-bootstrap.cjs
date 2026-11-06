const {app}=require('electron'),path=require('node:path')
if(!process.env.JTL_UI_PROFILE||!path.isAbsolute(process.env.JTL_UI_PROFILE))throw new Error('An isolated acceptance profile is required')
app.setPath('userData',process.env.JTL_UI_PROFILE)
// Real companion/loopback initialization with disposable settings, rather than
// the UI-only test mode. No real user's settings or browser profile is reused.
delete process.env.JTL_UI_TEST
require(path.resolve(__dirname,'../../out/main/index.js'))
