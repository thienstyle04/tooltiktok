#!/opt/dalat-updates-certbot/bin/python
"""Verify an uploaded Windows release, then atomically publish latest.json."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
import zipfile

from cryptography.hazmat.primitives import serialization

ROOT = Path('/srv/dalat-studio-updates')
INCOMING = ROOT / 'incoming'
PUBLIC_KEY = Path('/etc/dalat-studio-updates/release-public.pem')
MAX_BYTES = 2 * 1024 * 1024 * 1024


def verify_manifest(raw):
    envelope = json.loads(raw)
    payload = base64.b64decode(envelope['payload'], validate=True)
    signature = base64.b64decode(envelope['signature'], validate=True)
    if len(payload) > 32768 or len(signature) != 64:
        raise ValueError('Manifest size/signature invalid')
    key = serialization.load_pem_public_key(PUBLIC_KEY.read_bytes())
    key.verify(signature, payload)
    info = json.loads(payload)
    if info.get('schema') != 1 or info.get('channel') != 'stable' or info.get('platform') != 'win32-x64':
        raise ValueError('Manifest schema/channel/platform invalid')
    if not re.fullmatch(r'\d+\.\d+\.\d+', info.get('version', '')) or not re.fullmatch(r'[a-f0-9]{40}', info.get('commit', '')):
        raise ValueError('Version or commit invalid')
    artifact = info.get('artifact', {})
    if not re.fullmatch(r'releases/[a-zA-Z0-9._-]+\.zip', artifact.get('path', '')):
        raise ValueError('Artifact path invalid')
    if not re.fullmatch(r'[a-f0-9]{64}', artifact.get('sha256', '')) or not 0 < artifact.get('size', 0) <= MAX_BYTES:
        raise ValueError('Artifact hash/size invalid')
    if not isinstance(info.get('notes'), list) or not info['notes']:
        raise ValueError('Release notes missing')
    return info


def safe_zip(file, expected_version):
    required = {'start.bat', 'VERSION', 'package.json', 'backend/package.json', 'frontend/package.json', 'scripts/update-client.js', 'scripts/update-protocol.js'}
    with zipfile.ZipFile(file) as archive:
        names = set(archive.namelist())
        if not required.issubset(names):
            raise ValueError('Release ZIP misses required files')
        for item in archive.infolist():
            parts = item.filename.replace('\\', '/').split('/')
            if item.filename.startswith('/') or ':' in item.filename or '..' in parts or (item.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError('Unsafe ZIP entry')
            if 'node_modules' in parts or 'drive-file-cache' in parts or 'shared' in parts or item.filename.startswith('backend/data/') or item.filename.startswith('backend/resources/workbooks/') or parts[-1] == '.env':
                raise ValueError('Release contains machine data')
        raw_version = archive.read('VERSION').decode().strip()
        normalized = '.'.join(str(int(value)) for value in raw_version.split('.')[:2]) + '.' + str(int(raw_version.split('.')[2])).zfill(2)
        if normalized != expected_version:
            raise ValueError('VERSION mismatch')
        for name in ('package.json', 'backend/package.json', 'frontend/package.json'):
            if json.loads(archive.read(name))['version'] != expected_version:
                raise ValueError('Frontend/backend version mismatch')


def file_sha256(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main(manifest_arg, zip_arg, check_only=False):
    if os.geteuid() != 0:
        raise PermissionError('Publisher must run through sudo so published files stay root-owned')
    manifest = Path(manifest_arg).resolve(strict=True)
    uploaded_zip = Path(zip_arg).resolve(strict=True)
    if manifest.parent != INCOMING or uploaded_zip.parent != INCOMING or manifest.is_symlink() or uploaded_zip.is_symlink():
        raise ValueError('Uploads must be regular files in incoming')
    raw = manifest.read_bytes()
    info = verify_manifest(raw)
    artifact = info['artifact']
    if uploaded_zip.name != Path(artifact['path']).name:
        raise ValueError('Uploaded filename mismatch')
    if uploaded_zip.stat().st_size != artifact['size']:
        raise ValueError('ZIP size mismatch')
    digest = file_sha256(uploaded_zip)
    if digest != artifact['sha256']:
        raise ValueError('ZIP SHA-256 mismatch')
    safe_zip(uploaded_zip, info['version'])
    latest = ROOT / 'stable' / 'latest.json'
    if latest.exists():
        old = verify_manifest(latest.read_bytes())
        old_version = tuple(map(int, old['version'].split('.')))
        new_version = tuple(map(int, info['version'].split('.')))
        if new_version <= old_version:
            raise ValueError('Release version must increase')
    if check_only:
        print(f"Verified {info['version']} {info['commit'][:8]}: {artifact['path']} (not published)")
        return
    final_zip = ROOT / artifact['path']
    if final_zip.exists():
        if file_sha256(final_zip) != digest:
            raise ValueError('Immutable release name already has different bytes')
    else:
        with tempfile.NamedTemporaryFile(prefix='release-', suffix='.zip', dir=final_zip.parent, delete=False) as temporary:
            temporary_name = temporary.name
            with uploaded_zip.open('rb') as source:
                shutil.copyfileobj(source, temporary)
            temporary.flush()
            os.fsync(temporary.fileno())
        try:
            if file_sha256(Path(temporary_name)) != digest:
                raise ValueError('ZIP changed while publishing')
            os.chmod(temporary_name, 0o644)
            os.link(temporary_name, final_zip)
        finally:
            os.unlink(temporary_name)
    with tempfile.NamedTemporaryFile(prefix='latest-', suffix='.json', dir=latest.parent, delete=False) as temporary:
        temporary.write(raw)
        temporary.flush()
        os.fsync(temporary.fileno())
        temporary_name = temporary.name
    os.chmod(temporary_name, 0o644)
    os.replace(temporary_name, latest)
    print(f"Published {info['version']} {info['commit'][:8]}: {artifact['path']}")


if __name__ == '__main__':
    if len(sys.argv) not in (3, 4) or (len(sys.argv) == 4 and sys.argv[3] != '--check-only'):
        raise SystemExit('Usage: verify-and-publish.py INCOMING_MANIFEST INCOMING_ZIP [--check-only]')
    main(sys.argv[1], sys.argv[2], check_only=len(sys.argv) == 4)
