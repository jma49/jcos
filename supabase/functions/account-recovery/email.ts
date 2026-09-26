// The password reset email, dressed as a Mac OS X window: pinstripes, a
// brushed title bar with traffic lights, the Keychain icon and an Aqua
// button. Everything is inline styles in tables, which is what mail
// clients render; clients that drop gradients (Gmail, Outlook) fall back
// to the flat colours set alongside them.
//
// Change the wording or look here. Preview it with
// `node supabase/functions/account-recovery/preview.mjs`.

export interface ResetEmail {
  subject: string;
  text: string;
  html: string;
}

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const FONT = `'Lucida Grande', 'Lucida Sans Unicode', -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif`;

/** One of the title bar's three lights. */
const light = (fill: string, rim: string) =>
  `<td style="padding:0 4px 0 0"><div style="width:12px;height:12px;border-radius:6px;background:${fill};background-image:radial-gradient(circle at 50% 30%,#ffffffcc 0,${fill} 45%);border:1px solid ${rim}"></div></td>`;

export function resetEmail({ username, link, site }: { username: string; link: string; site: string }): ResetEmail {
  const subject = `Keychain Access wants a new password for ${username}`;
  const text = [
    `Keychain Access, JM/OS`,
    ``,
    `Forgot your password? It happens to the best of us.`,
    ``,
    `Someone (hopefully you) asked to reset the password for ${username} on JM/OS. Choose a new one here:`,
    ``,
    link,
    ``,
    `The link works once and expires in 30 minutes.`,
    ``,
    `Didn't ask? Ignore this email, and your password stays as it is.`,
    ``,
    `JM/OS, a Mac OS X desktop at ${site.replace(/^https?:\/\//, '')}`
  ].join('\n');

  const user = escape(username);
  const href = escape(link);
  const home = escape(site);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#d5d8dd;background-image:repeating-linear-gradient(0deg,#d5d8dd 0,#d5d8dd 2px,#dfe2e6 2px,#dfe2e6 4px)">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">One click, thirty minutes, and you're back on the desktop.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#d5d8dd;background-image:repeating-linear-gradient(0deg,#d5d8dd 0,#d5d8dd 2px,#dfe2e6 2px,#dfe2e6 4px)">
<tr><td align="center" style="padding:40px 16px">

<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:480px;border:1px solid #8e8e8e;border-radius:8px;overflow:hidden;box-shadow:0 12px 32px rgba(0,0,0,0.28);font-family:${FONT}">
<tr>
<td style="background:#d8d8d8;background-image:linear-gradient(#f2f2f2,#cfcfcf);border-bottom:1px solid #9c9c9c;padding:6px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="60" style="width:60px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${light('#ff5f57', '#e0443e')}${light('#febc2e', '#dea123')}${light('#28c840', '#1aab29')}</tr></table></td>
<td align="center" style="font-family:${FONT};font-size:13px;color:#2b2b2b;text-shadow:0 1px 0 #ffffff">Keychain Access</td>
<td width="60" style="width:60px">&nbsp;</td>
</tr></table>
</td>
</tr>
<tr>
<td style="background:#f3f3f3;background-image:repeating-linear-gradient(0deg,#f3f3f3 0,#f3f3f3 2px,#ffffff 2px,#ffffff 4px);padding:32px 36px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding-bottom:14px"><img src="${home}/os/icons/keychain.png" width="80" height="80" alt="" style="display:block;border:0"></td></tr>
<tr><td align="center" style="font-family:${FONT};font-size:19px;font-weight:bold;color:#1d1d1d;padding-bottom:10px">Forgot your password?</td></tr>
<tr><td align="center" style="font-family:${FONT};font-size:13px;line-height:1.6;color:#3a3a3a;padding-bottom:22px">
It happens to the best of us. Someone (hopefully you) asked to reset the password for <strong style="color:#1d1d1d">${user}</strong> on JM/OS.
</td></tr>
<tr><td align="center" style="padding-bottom:20px">
<a href="${href}" style="display:inline-block;padding:9px 28px;border-radius:15px;border:1px solid #1f5fbf;background:#3a8ee6;background-image:linear-gradient(#a9d2ff 0%,#5aa5f5 48%,#2f7fe0 52%,#5fb0ff 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,0.6),0 1px 2px rgba(0,0,0,0.3);color:#ffffff;font-family:${FONT};font-size:14px;font-weight:bold;text-decoration:none;text-shadow:0 -1px 0 rgba(0,40,110,0.45)">Choose a New Password</a>
</td></tr>
<tr><td align="center" style="font-family:${FONT};font-size:11px;color:#6b6b6b;padding-bottom:22px">The link works once and expires in 30 minutes.</td></tr>
<tr><td style="border-top:1px solid #d9d9d9;padding-top:16px;font-family:${FONT};font-size:11px;line-height:1.55;color:#7a7a7a">
Button not working? Paste this into your browser:<br>
<a href="${href}" style="color:#2a6fdb;word-break:break-all;font-family:Monaco,Menlo,monospace;font-size:10px">${href}</a>
</td></tr>
</table>
</td>
</tr>
<tr>
<td style="background:#e6e6e6;background-image:linear-gradient(#ececec,#dcdcdc);border-top:1px solid #c4c4c4;padding:10px 16px;font-family:${FONT};font-size:10px;color:#6e6e6e;text-align:center">
Didn't ask? Ignore this email, and your password stays as it is.
</td>
</tr>
</table>

<p style="margin:16px 0 0;font-family:${FONT};font-size:10px;color:#6e737a;text-align:center">
JM/OS &middot; a Mac OS X desktop at <a href="${home}" style="color:#4a5a70">${escape(site.replace(/^https?:\/\//, ''))}</a>
</p>

</td></tr>
</table>
</body>
</html>`;

  return { subject, text, html };
}
