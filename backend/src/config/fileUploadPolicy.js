/**
 * Single source of truth for upload MIME/extension contracts.
 *
 * The unified multer middleware is the authoritative validator.  Legacy
 * middleware/config exports consume the same immutable lists so their public
 * contracts cannot silently drift from the routes that are actually used.
 */

const freezeType = (type) => Object.freeze({
  extensions: Object.freeze([...type.extensions]),
  mimeTypes: Object.freeze([...type.mimeTypes]),
  maxSize: type.maxSize,
});

const FILE_TYPES = Object.freeze({
  IMAGE: freezeType({
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'],
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'],
    maxSize: 5 * 1024 * 1024,
  }),
  DOCUMENT: freezeType({
    extensions: ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt'],
    mimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
    ],
    maxSize: 10 * 1024 * 1024,
  }),
  AVATAR: freezeType({
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxSize: 2 * 1024 * 1024,
  }),
  EXCEL: freezeType({
    extensions: ['.xlsx', '.xls', '.csv'],
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      // Some mobile browsers and desktop drag/drop sources report Excel as
      // octet-stream.  The validator additionally requires an Excel
      // extension and a matching file signature/text payload.
      'application/octet-stream',
    ],
    maxSize: 10 * 1024 * 1024,
  }),
  ARCHIVE: freezeType({
    extensions: ['.zip', '.rar', '.7z'],
    mimeTypes: [
      'application/zip',
      'application/x-rar-compressed',
      'application/vnd.rar',
      'application/x-7z-compressed',
    ],
    maxSize: 50 * 1024 * 1024,
  }),
});

const ATTACHMENT_TYPES = Object.freeze(['IMAGE', 'DOCUMENT', 'EXCEL', 'ARCHIVE']);
const ATTACHMENT_MIME_TYPES = Object.freeze([
  ...new Set(ATTACHMENT_TYPES.flatMap((type) => FILE_TYPES[type].mimeTypes)),
]);
const ATTACHMENT_EXTENSIONS = Object.freeze([
  ...new Set(ATTACHMENT_TYPES.flatMap((type) => FILE_TYPES[type].extensions)),
]);
const EXCEL_EXTENSIONS = Object.freeze([...FILE_TYPES.EXCEL.extensions]);

module.exports = {
  FILE_TYPES,
  ATTACHMENT_TYPES,
  ATTACHMENT_MIME_TYPES,
  ATTACHMENT_EXTENSIONS,
  EXCEL_EXTENSIONS,
  ATTACHMENT_MAX_SIZE: 10 * 1024 * 1024,
};
