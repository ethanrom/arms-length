/**
 * What we tell people about their photo. True because the live session collects the YouCam tasks it creates and the
 * browser asks for them to be deleted when the visitor leaves (lib/integration/live.ts -> POST /api/youcam/cleanup),
 * and because nothing here stores the photo. If the page is closed without that call getting through, YouCam's own
 * retention applies (at most 30 days, docs.perfectcorp.com file retention).
 */
export const PRIVACY_LINE = "Your photo is analysed by YouCam and deleted from YouCam when you leave this page. We don't store your photo.";
