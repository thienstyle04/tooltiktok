# Dalat Studio update channel

The server serves only signed Windows releases at
`https://113.161.254.76/dalat-studio/updates/`. It does not run the tool,
store a Windows machine's data, or publish automatically on a Git push.

## First-time installation on a Windows machine

1. Close Dalat Studio. Keep a copy of the old installation until the new one
   starts successfully. Do not delete its `backend/data` or `.env`.
2. Download the published release ZIP from the update URL and extract it to a
   separate folder on the same drive as the old installation.
3. In PowerShell, run:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File "<extracted>\scripts\bootstrap-updates.ps1" -InstallRoot "<old-installation>" -PackageRoot "<extracted>"
   ```

   The bootstrap refuses to run while ports 3000/3001 are in use. It moves
   `backend/data` to `<old-installation>/shared/data`, verifies file count and
   total bytes, and creates a compatibility junction at the old path. It keeps
   the old code release for recovery. Existing local API settings remain local.
4. Start the tool from the old installation's `start.bat`. Later releases will
   arrive through the in-app prompt. The tool still downloads Google Sheet data
   on a new machine and keeps its nighttime data-sync policy.

Do not run bootstrap twice or over an existing `shared/data`. If it stops
before creating `shared/current.json`, inspect the partially prepared folders
and data before retrying. The old installation is not automatically removed.

## Manual release procedure

1. Commit and test the Windows source. Keep the release signing private key
   outside Git at `%LOCALAPPDATA%\DalatStudioReleaseSigning\private.pem` (or
   point `DALAT_RELEASE_SIGNING_KEY` at a protected key). Never include `.env`,
   API keys, `backend/data`, cache, lists, or schedules in the package.
2. On Windows run `node scripts/build-update-release.js "Release note"`. The
   builder signs `outputs/update-release/latest.json` and writes the ZIP there.
3. Upload both files to `/srv/dalat-studio-updates/incoming/` using SSH key
   authentication. Run on the server:

   ```sh
   sudo /usr/local/bin/dalat-updates-publish /srv/dalat-studio-updates/incoming/latest.json /srv/dalat-studio-updates/incoming/<archive>.zip --check-only
   ```

4. After a separate Windows install/update test and review, run the same
   command without `--check-only`. That verifies the signature, hash, ZIP and
   version before atomically replacing `stable/latest.json`. The public ZIP
   filename is immutable; a version must increase to be published.
5. Verify TLS, the manifest, a canary Windows machine, and the server's
   existing websites before inviting all machines to update. The in-app
   installer verifies again and rolls its code pointer back if health fails.

The server's separate `dalat-updates-renew.timer` checks the short-lived IP
certificate three times daily. Check it with `systemctl status
dalat-updates-renew.timer` and inspect the certificate expiry regularly. It
uses a separate Certbot environment/config from the server's other sites.
Rotate the password previously shared for this host after confirming SSH-key
access for all administrators; doing so may affect other users of the server.
