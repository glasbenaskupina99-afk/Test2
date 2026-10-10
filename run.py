#!/usr/bin/env python3
"""Start Language Master.

    python run.py              # HTTPS on port 8443 (needed for the phone microphone)
    python run.py --http       # plain HTTP on port 8000 (mic only works on localhost)

The first HTTPS start creates a self-signed certificate in data/certs. Your phone
will warn about it once — accept it ("Advanced" -> "Proceed").
"""
import argparse
import datetime
import ipaddress
import os
import socket
from pathlib import Path

import uvicorn

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get("HANZI_DATA_DIR", ROOT / "data"))


def lan_ips() -> list[str]:
    ips = {"127.0.0.1"}
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))  # no packets are sent
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    return sorted(ips)


def ensure_cert() -> tuple[Path, Path]:
    cert_dir = DATA / "certs"
    cert, key = cert_dir / "cert.pem", cert_dir / "key.pem"
    if cert.exists() and key.exists():
        return cert, key

    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID

    cert_dir.mkdir(parents=True, exist_ok=True)
    pkey = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Language Master")])
    host = socket.gethostname()
    alt = [x509.DNSName("localhost"), x509.DNSName(host), x509.DNSName(f"{host}.local")]
    alt += [x509.IPAddress(ipaddress.ip_address(ip)) for ip in lan_ips()]
    now = datetime.datetime.now(datetime.timezone.utc)
    certificate = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(pkey.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=3650))
        .add_extension(x509.SubjectAlternativeName(alt), critical=False)
        .sign(pkey, hashes.SHA256())
    )
    key.write_bytes(
        pkey.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption()
        )
    )
    cert.write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
    return cert, key


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--http", action="store_true", help="serve plain HTTP instead of HTTPS")
    ap.add_argument("--host", default=os.environ.get("HOST", "0.0.0.0"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 0)) or None)
    args = ap.parse_args()
    use_https = not args.http and os.environ.get("HTTPS", "1") not in ("0", "false", "no")
    port = args.port or (8443 if use_https else 8000)

    ssl = {}
    if use_https:
        cert, key = ensure_cert()
        ssl = {"ssl_certfile": str(cert), "ssl_keyfile": str(key)}

    scheme = "https" if use_https else "http"
    print("\n  Language Master is starting. Open on your phone:")
    for ip in lan_ips():
        if ip != "127.0.0.1":
            print(f"    {scheme}://{ip}:{port}")
    print(f"    {scheme}://localhost:{port}\n")
    uvicorn.run("app.main:app", host=args.host, port=port, log_level="info", **ssl)


if __name__ == "__main__":
    main()
