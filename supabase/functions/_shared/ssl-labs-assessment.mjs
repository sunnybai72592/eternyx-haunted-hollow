export function flattenProtocolSuites(protocolSuites) {
  if (!Array.isArray(protocolSuites)) return [];
  return protocolSuites.flatMap((protocol) =>
    Array.isArray(protocol?.list) ? protocol.list : [],
  );
}

export function collectSslLabsFindings(endpoints, certificates, now = Date.now()) {
  const findings = [];
  const seen = new Set();
  const add = (finding) => {
    if (seen.has(finding.id)) return;
    seen.add(finding.id);
    findings.push(finding);
  };

  for (const endpoint of Array.isArray(endpoints) ? endpoints : []) {
    if (endpoint?.statusMessage !== "Ready" || !endpoint.details) continue;
    const details = endpoint.details;

    for (const protocol of Array.isArray(details.protocols) ? details.protocols : []) {
      const version = String(protocol?.version ?? "");
      if (
        protocol?.q === 0 ||
        protocol?.name === "SSL" ||
        (protocol?.name === "TLS" && ["1.0", "1.1"].includes(version))
      ) {
        add({
          id: "WEAK_PROTOCOL",
          name: "Weak TLS protocol support",
          severity: "medium",
          description: `The endpoint supports ${protocol.name ?? "an insecure"} protocol version ${version || "reported as insecure"}.`,
        });
      }
    }

    const weakCiphers = flattenProtocolSuites(details.suites).filter((suite) => {
      const name = String(suite?.name ?? "");
      return suite?.q === 0 || suite?.q === 1 ||
        (typeof suite?.cipherStrength === "number" && suite.cipherStrength < 128) ||
        /RC4|3DES|(^|_)DES(_|$)/i.test(name);
    });
    if (weakCiphers.length > 0) {
      add({
        id: "WEAK_CIPHER",
        name: "Weak cipher suites",
        severity: "high",
        description: `${weakCiphers.length} weak or insecure cipher suite(s) were reported across the assessed endpoint.`,
      });
    }

    const vulnerabilityChecks = [
      ["heartbleed", "HEARTBLEED", "Heartbleed", "critical"],
      ["drownVulnerable", "DROWN", "DROWN", "high"],
      ["poodle", "POODLE", "POODLE", "high"],
      ["freak", "FREAK", "FREAK", "high"],
      ["logjam", "LOGJAM", "Logjam", "high"],
    ];
    for (const [field, id, name, severity] of vulnerabilityChecks) {
      if (details[field] === true) {
        add({
          id,
          name: `${name} vulnerability`,
          severity,
          description: `SSL Labs reported this endpoint as vulnerable to ${name}.`,
        });
      }
    }

    if (details.openSslCcs === 3) {
      add({
        id: "OPENSSL_CCS",
        name: "OpenSSL CCS injection",
        severity: "high",
        description: "SSL Labs reported the endpoint as vulnerable and exploitable in its CCS injection test.",
      });
    }
  }

  const certificate = Array.isArray(certificates) ? certificates[0] : null;
  if (certificate && Number.isFinite(certificate.notAfter)) {
    const expiresAt = certificate.notAfter * 1000;
    const daysUntilExpiry = Math.floor((expiresAt - now) / 86400000);
    if (daysUntilExpiry < 30) {
      add({
        id: "CERT_EXPIRING",
        name: daysUntilExpiry < 0 ? "Certificate expired" : "Certificate expiring soon",
        severity: daysUntilExpiry < 7 ? "high" : "medium",
        description: daysUntilExpiry < 0
          ? `The leaf certificate expired ${Math.abs(daysUntilExpiry)} day(s) ago.`
          : `The leaf certificate expires in ${daysUntilExpiry} day(s).`,
      });
    }
  }

  return findings;
}

export function deriveSslLabsChecks(endpoint, certificates, now = Date.now()) {
  const details = endpoint?.details ?? {};
  const protocols = Array.isArray(details.protocols) ? details.protocols : [];
  const certificate = Array.isArray(certificates) ? certificates[0] : null;
  const notBefore = Number.isFinite(certificate?.notBefore) ? certificate.notBefore * 1000 : null;
  const notAfter = Number.isFinite(certificate?.notAfter) ? certificate.notAfter * 1000 : null;
  const certificateValid = notBefore !== null && notAfter !== null
    ? now >= notBefore && now <= notAfter
    : null;

  const hstsStatus = details.hstsPolicy?.status;
  const hstsEnabled = hstsStatus === "present"
    ? true
    : ["absent", "invalid", "disabled"].includes(hstsStatus)
      ? false
      : null;

  const hasSct = details.hasSct;
  const certificateTransparency = Number.isInteger(hasSct) ? hasSct > 0 : null;
  const forwardSecrecy = details.forwardSecrecy;

  return {
    certificate_valid: certificateValid,
    supports_tls13: protocols.length > 0
      ? protocols.some((protocol) => protocol.name === "TLS" && String(protocol.version) === "1.3")
      : null,
    hsts_enabled: hstsEnabled,
    certificate_transparency: certificateTransparency,
    ocsp_stapling: typeof details.ocspStapling === "boolean" ? details.ocspStapling : null,
    perfect_forward_secrecy: Number.isInteger(forwardSecrecy)
      ? (forwardSecrecy & 1) === 1
      : null,
    certificate_chain_valid: null,
  };
}
