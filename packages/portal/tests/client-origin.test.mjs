import assert from "node:assert/strict";
import test from "node:test";
import {
  clientIpHeaderSetting,
  clientOrigin,
  clientOriginProblems,
  clientOriginSettings,
  connectionAddress,
  originKey,
  requestOrigin,
  trustedProxiesSetting,
} from "../dist/api/client-origin.js";

// The one reading of a visitor's network address: every limit of the service
// counts against it.

const headers = (values) => new Headers(values);
const forwarded = { clientIpHeader: "x-forwarded-for", trustedProxies: 1 };

test("the settings are read from the environment, by their names", () => {
  assert.deepEqual(clientOriginSettings({}), {
    clientIpHeader: null,
    trustedProxies: 1,
  });
  assert.deepEqual(
    clientOriginSettings({
      ASTRO_PORTAL_CLIENT_IP_HEADER: " X-Forwarded-For ",
      ASTRO_PORTAL_TRUSTED_PROXIES: "2",
    }),
    { clientIpHeader: "x-forwarded-for", trustedProxies: 2 },
  );
  assert.equal(clientIpHeaderSetting("Socket"), "socket");
  assert.equal(clientIpHeaderSetting("CF-Connecting-IP"), "cf-connecting-ip");
  assert.equal(clientIpHeaderSetting("x forwarded"), "invalid");
  assert.equal(clientIpHeaderSetting("   "), null);
  for (const wrong of ["0", "11", "two", "1.5", "-1"])
    assert.equal(trustedProxiesSetting(wrong), null, wrong);
  assert.equal(trustedProxiesSetting(""), 1);
  assert.equal(trustedProxiesSetting("10"), 10);
});

test("a wrong setting is named, never its value", () => {
  assert.deepEqual(clientOriginProblems(clientOriginSettings({})), []);
  assert.deepEqual(
    clientOriginProblems(
      clientOriginSettings({ ASTRO_PORTAL_CLIENT_IP_HEADER: "socket" }),
    ),
    [],
  );
  const problems = clientOriginProblems(
    clientOriginSettings({
      ASTRO_PORTAL_CLIENT_IP_HEADER: "secret value",
      ASTRO_PORTAL_TRUSTED_PROXIES: "many",
    }),
  );
  assert.deepEqual(problems, [
    "ASTRO_PORTAL_CLIENT_IP_HEADER (a header name, or socket)",
    "ASTRO_PORTAL_TRUSTED_PROXIES (a whole number from 1 to 10)",
  ]);
  assert.ok(!problems.join().includes("secret"));
  assert.ok(!problems.join().includes("many"));
});

test("without settings, the origin is the connection's own address", () => {
  const request = headers({
    "x-forwarded-for": "6.6.6.6",
    "cf-connecting-ip": "7.7.7.7",
    "x-astro-client-ip": "192.168.1.20",
  });
  assert.equal(clientOrigin(request), "192.168.1.20");
  assert.equal(clientOrigin(request, {}), "192.168.1.20");
  assert.equal(clientOrigin(request, clientOriginSettings({})), "192.168.1.20");
  assert.equal(
    clientOrigin(request, { clientIpHeader: "socket", trustedProxies: 1 }),
    "192.168.1.20",
  );
  // A setting that is wrong counts the connection too, and the service
  // does not start (clientOriginProblems).
  assert.equal(
    clientOrigin(request, { clientIpHeader: "invalid", trustedProxies: null }),
    "192.168.1.20",
  );
  assert.equal(clientOrigin(headers({})), "");
  assert.equal(requestOrigin({ headers: headers({}) }, {}), "unknown");
});

test("x-forwarded-for is read from the right, as far as the trusted proxies go", () => {
  const request = headers({
    "x-forwarded-for": "6.6.6.6, 203.0.113.9, 198.51.100.2",
    "x-astro-client-ip": "10.0.0.5",
  });
  assert.equal(clientOrigin(request, forwarded), "198.51.100.2");
  assert.equal(
    clientOrigin(request, { ...forwarded, trustedProxies: 2 }),
    "203.0.113.9",
  );
  // The value a client writes first is never read: a header holding fewer
  // values than the proxies in front was not written by them.
  assert.equal(
    clientOrigin(
      headers({
        "x-forwarded-for": "6.6.6.6, 203.0.113.9",
        "x-astro-client-ip": "10.0.0.5",
      }),
      { ...forwarded, trustedProxies: 3 },
    ),
    "10.0.0.5",
  );
  // Without the header: the connection's own address.
  assert.equal(
    clientOrigin(headers({ "x-astro-client-ip": "10.0.0.5" }), forwarded),
    "10.0.0.5",
  );
});

test("two visitors behind the same proxy are two origins, and an invented header changes nothing", () => {
  const visit = (forwardedFor) =>
    clientOrigin(
      headers({
        "x-astro-client-ip": "100.64.0.5",
        "x-forwarded-for": forwardedFor,
      }),
      forwarded,
    );
  assert.notEqual(visit("203.0.113.1"), visit("203.0.113.2"));
  // Whatever a visitor writes before the platform's entry appends the true
  // address, its origin stays its own.
  for (const invented of ["6.6.6.6, ", "6.6.6.6, 7.7.7.7, ", "unknown, ", ", "])
    assert.equal(
      visit(`${invented}203.0.113.1`),
      visit("203.0.113.1"),
      invented,
    );
  // A header that says nothing readable is one origin, not one per value.
  assert.equal(visit("garbage"), "unknown");
  assert.equal(visit("also garbage"), "unknown");
});

test("socket counts the connection; another header counts its one value", () => {
  const request = headers({
    "x-forwarded-for": "6.6.6.6",
    "cf-connecting-ip": "7.7.7.7",
    "x-astro-client-ip": "::ffff:192.0.2.44",
  });
  assert.equal(
    clientOrigin(request, { clientIpHeader: "socket" }),
    "192.0.2.44",
  );
  const behindProxy = { clientIpHeader: "cf-connecting-ip", trustedProxies: 1 };
  assert.equal(clientOrigin(request, behindProxy), "7.7.7.7");
  assert.equal(
    clientOrigin(
      headers({
        "cf-connecting-ip": "7.7.7.7, 8.8.8.8",
        "x-astro-client-ip": "10.0.0.5",
      }),
      behindProxy,
    ),
    "10.0.0.5",
    "two values were not written by the proxy alone",
  );
});

test("a Node request's plain headers are read like a Headers", () => {
  const plain = {
    "x-forwarded-for": ["6.6.6.6", "203.0.113.1"],
    "x-astro-client-ip": "10.0.0.5",
  };
  assert.equal(clientOrigin(plain, forwarded), "203.0.113.1");
  assert.equal(clientOrigin(plain, {}), "10.0.0.5");
  assert.equal(connectionAddress(plain), "10.0.0.5");
  assert.equal(connectionAddress(headers({})), "");
});

test("the connection's address is given raw, for an access rule", () => {
  assert.equal(
    connectionAddress(headers({ "x-astro-client-ip": "::ffff:10.0.0.5" })),
    "::ffff:10.0.0.5",
  );
});

test("a route reads the origin from the environment's settings", () => {
  const request = {
    headers: headers({
      "x-astro-client-ip": "100.64.0.5",
      "x-forwarded-for": "6.6.6.6, 203.0.113.1",
    }),
  };
  assert.equal(requestOrigin(request, {}), "100.64.0.5");
  assert.equal(
    requestOrigin(request, {
      ASTRO_PORTAL_CLIENT_IP_HEADER: "x-forwarded-for",
    }),
    "203.0.113.1",
  );
});

test("an IPv6 origin is its /64; made-up values are one origin", () => {
  assert.equal(originKey("2001:db8:1:2:3:4:5:6"), "2001:db8:1:2::/64");
  assert.equal(originKey("2001:DB8:1:2:ffff::1"), "2001:db8:1:2::/64");
  assert.equal(originKey("[2001:db8:1:2::9]:443"), "2001:db8:1:2::/64");
  assert.equal(originKey("2001:db8::1"), "2001:db8:0:0::/64");
  assert.equal(originKey("fe80::1%en0"), "fe80:0:0:0::/64");
  assert.equal(originKey("::ffff:203.0.113.7"), "203.0.113.7");
  assert.equal(originKey("::ffff:cb00:7107"), "203.0.113.7");
  assert.equal(originKey("203.0.113.7:5555"), "203.0.113.7");
  assert.equal(originKey(" 203.0.113.7 "), "203.0.113.7");
  assert.equal(originKey(""), "");
  for (const madeUp of ["hello", "999.1.1.1", "203.0.113.7.1", "unknown"])
    assert.equal(originKey(madeUp), "unknown", madeUp);
  assert.notEqual(originKey("2001:db8:1:3::1"), originKey("2001:db8:1:2::1"));
  // Through the reading: two addresses of one /64 are one origin, another
  // /64 is another.
  const visit = (address) =>
    clientOrigin(
      headers({
        "x-astro-client-ip": "100.64.0.5",
        "x-forwarded-for": address,
      }),
      forwarded,
    );
  assert.equal(visit("2001:db8:1:2::1"), visit("2001:db8:1:2:aaaa:bbbb::9"));
  assert.notEqual(visit("2001:db8:1:2::1"), visit("2001:db8:1:3::1"));
});
