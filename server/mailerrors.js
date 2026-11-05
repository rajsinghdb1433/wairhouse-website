'use strict';
// Plain-English versions of mail server errors, and a check for "the account is the problem" (bad login, unreachable server)
// as opposed to one refused recipient. No dependencies and no side effects, so it can be unit tested on its own.
const text = (e) => String((e && (e.response || e.message)) || e || '');

const BASIC_AUTH = /basic authentication|5\.7\.139|5\.7\.30|SmtpClientAuthentication/i;
// Gmail's own wording (535-5.7.8 BadCredentials, 534-5.7.9 Application-specific password required, signed "gsmtp"): it will never accept a normal password from a website.
const GMAIL_PASSWORD = /gsmtp|BadCredentials|Application-specific password|support\.google\.com/i;
const NOT_FOUND = /ENOTFOUND|EAI_AGAIN|getaddrinfo/i;
const UNREACHABLE = /ETIMEDOUT|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|connection (timeout|timed out|closed)|socket (hang up|closed)|greeting never received/i;
const NOT_FOUND_CODES = ['ENOTFOUND', 'EDNS', 'EAI_AGAIN'];
const UNREACHABLE_CODES = ['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ESOCKET', 'ECONNECTION', 'EHOSTUNREACH', 'ENETUNREACH'];
const badLogin = (e, m) => !!e && (e.code === 'EAUTH' || e.responseCode === 535 || /invalid login|authentication (failed|unsuccessful)|\b535\b/i.test(m));

function friendlyError(e) {
  const m = text(e);
  if (BASIC_AUTH.test(m)) return 'This provider no longer allows password sign-in for sending email (personal Hotmail and Outlook.com accounts do not). Use a Hostinger Email mailbox or another provider.';
  if (GMAIL_PASSWORD.test(m)) return 'Gmail did not accept that password. Gmail needs a 16-letter app password, not your normal password. Turn on 2-Step Verification, then create an app password at myaccount.google.com/apppasswords and type it here.';
  if (badLogin(e, m)) return 'The mail server did not accept that username or password.';
  if ((e && NOT_FOUND_CODES.includes(e.code)) || NOT_FOUND.test(m)) return 'That mail server name was not found. Check the host name.';
  if ((e && UNREACHABLE_CODES.includes(e.code)) || UNREACHABLE.test(m)) return 'Could not reach the mail server. Check the host and port.';
  return m.replace(/\s+/g, ' ').slice(0, 240) || 'Email could not be sent.';
}

// True when the account or server is at fault. A refused recipient (for example 550 user unknown) is not.
const accountError = (e) => !!e && (BASIC_AUTH.test(text(e)) || badLogin(e, text(e)) || NOT_FOUND_CODES.includes(e.code) || UNREACHABLE_CODES.includes(e.code) || NOT_FOUND.test(text(e)) || UNREACHABLE.test(text(e)));

module.exports = { friendlyError, accountError };
