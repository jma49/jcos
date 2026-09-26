// Writes the password reset email to a file to open in a browser:
//   node supabase/functions/account-recovery/preview.mjs [out.html]
// (Node 22.18 or later reads email.ts directly.)
import { writeFileSync } from 'node:fs';
import { resetEmail } from './email.ts';

const out = process.argv[2] ?? 'reset-email-preview.html';
const mail = resetEmail({
  username: 'majincheng',
  link: 'https://www.majincheng.com/?open=account&reset=PREVIEW-TOKEN-NOT-A-REAL-LINK-000000000000',
  site: 'https://www.majincheng.com'
});
writeFileSync(out, mail.html);
console.log(`Subject: ${mail.subject}\nWrote ${out}`);
