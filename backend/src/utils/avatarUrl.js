const fs = require('fs');
const path = require('path');

const LOCAL_AVATAR_PREFIX = '/uploads/avatars/';

/**
 * Return a browser-safe avatar URL. Local avatar references are only returned
 * when the referenced file still exists; remote/custom URLs are left intact.
 *
 * @param {*} avatarUrl
 * @param {object} [options]
 * @param {string} [options.uploadsRoot]
 * @returns {string|null}
 */
function normalizeAvatarUrl(avatarUrl, options = {}) {
  if (typeof avatarUrl !== 'string' || !avatarUrl.trim()) {
    return null;
  }

  const normalizedUrl = avatarUrl.trim();
  if (!normalizedUrl.startsWith(LOCAL_AVATAR_PREFIX)) {
    return normalizedUrl;
  }

  const encodedFilename = normalizedUrl.slice(LOCAL_AVATAR_PREFIX.length);
  let filename;
  try {
    filename = decodeURIComponent(encodedFilename);
  } catch {
    return null;
  }

  // Avatar uploads are flat files. Reject separators and dot segments before
  // resolving the path so a stored URL can never escape the avatar directory.
  if (
    !filename ||
    filename === '.' ||
    filename === '..' ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('\0')
  ) {
    return null;
  }

  const uploadsRoot = options.uploadsRoot || path.resolve(process.cwd(), 'uploads');
  const avatarRoot = path.resolve(uploadsRoot, 'avatars');
  const avatarPath = path.resolve(avatarRoot, filename);
  if (!avatarPath.startsWith(`${avatarRoot}${path.sep}`)) {
    return null;
  }

  try {
    return fs.statSync(avatarPath).isFile() ? normalizedUrl : null;
  } catch {
    return null;
  }
}

module.exports = {
  LOCAL_AVATAR_PREFIX,
  normalizeAvatarUrl,
};
