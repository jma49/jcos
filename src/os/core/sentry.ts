// Sends what report() is given to Sentry. Loaded on the first report, and
// only when the build has a DSN (core/report.ts).
//
// A client of its own rather than Sentry.init(): no global handlers, no
// breadcrumbs, no tracing or replay, only the errors passed in, so the
// chunk stays small. One error in five is sent. Nothing personal goes:
// no user, cookies, headers or bodies (dataCollection), and every URL
// loses its query string and hash (a password reset's token, ?open=,
// ?place=).

import { BrowserClient, dedupeIntegration, defaultStackParser, linkedErrorsIntegration, makeFetchTransport, Scope } from '@sentry/browser';
import type { ErrorEvent } from '@sentry/browser';

/** The share of errors sent. */
export const SAMPLE_RATE = 0.2;

/** `text` with every URL's query string and hash taken off. */
export const withoutQueries = (text: string) => text.replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^\s?#"'<>]*)[?#][^\s"'<>]*/gi, '$1');

/** The event, with nothing personal left in it. */
export function scrub(event: ErrorEvent): ErrorEvent {
  delete event.user;
  delete event.breadcrumbs;
  delete event.extra;
  if (event.request) event.request = event.request.url ? { url: withoutQueries(event.request.url) } : undefined;
  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = withoutQueries(value.value);
    for (const frame of value.stacktrace?.frames ?? []) {
      if (frame.abs_path) frame.abs_path = withoutQueries(frame.abs_path);
      if (frame.filename) frame.filename = withoutQueries(frame.filename);
    }
  }
  if (event.message) event.message = withoutQueries(event.message);
  return event;
}

export function makeSender(dsn: string) {
  const client = new BrowserClient({
    dsn,
    release: __JMOS_BUILD__,
    environment: 'production',
    sampleRate: SAMPLE_RATE,
    // Collect nothing about the visitor or their requests.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
      frameContextLines: 0
    },
    transport: makeFetchTransport,
    stackParser: defaultStackParser,
    integrations: [dedupeIntegration(), linkedErrorsIntegration()],
    beforeSend: scrub
  });
  const scope = new Scope();
  scope.setClient(client);
  client.init();
  return (error: Error, where: string) => {
    const here = scope.clone();
    here.setTag('where', where);
    here.captureException(error);
  };
}
