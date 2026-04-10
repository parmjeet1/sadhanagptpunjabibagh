import multer from 'multer';
import path from 'path';
import fs from 'fs';

// import { S3Client } from "@aws-sdk/client-s3";
import dotenv from 'dotenv';
dotenv.config();
export const uploadFiles = (req, res, dirName, fileFields, maxFiles = 10, allowedFileTypes = ['png', 'jpeg', 'jpg', 'webp']) => {
    return new Promise((resolve, reject) => {
        // CHANGED: Use 'public' instead of 'uploads' to match your requirement
        const uploadPath = path.join(process.cwd(), "public", dirName);

        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        const storage = multer.diskStorage({
            destination: (req, file, cb) => cb(null, uploadPath),
            filename: (req, file, cb) => {
                const ext = path.extname(file.originalname);
                const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
                cb(null, uniqueName);
            }
        });

        const fileFilter = (req, file, cb) => {
            const fileExtension = path.extname(file.originalname).slice(1).toLowerCase();
            if (!allowedFileTypes.includes(fileExtension)) {
                return cb(new Error(`Invalid File Type! Only ${allowedFileTypes.join(', ')}`), false);
            }
            cb(null, true);
        };

        const upload = multer({
            storage,
            limits: { fileSize: 10 * 1024 * 1024 },
            fileFilter,
        }).fields(fileFields.map(field => ({ name: field, maxCount: maxFiles })));

        upload(req, res, (err) => {
            if (err) {
                return reject({ field: 'image', message: err.message });
            }

            const result = {};
            if (req.files) {
                for (const field of Object.keys(req.files)) {
                    result[field] = req.files[field].map(file => ({
                        ...file,
                        // CHANGED: URL path matches the public directory structure
                        file_url: `/${dirName}/${file.filename}`
                    }));
                }
            }
            resolve(result);
        });
    });
};


export const olduploadFiles = (req, res, dirName, fileFields, maxFiles = 10, allowedFileTypes = ['png', 'jpeg', 'jpg']) => {
    return new Promise((resolve, reject) => {

        const uploadPath = path.join(process.cwd(), "uploads", dirName);

        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        const storage = multer.diskStorage({
            destination: (req, file, cb) => cb(null, uploadPath),
            filename: (req, file, cb) => {
                const ext = path.extname(file.originalname);
                const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
                cb(null, uniqueName);
            }
        });

        const fileFilter = (req, file, cb) => {
            const fileExtension = path.extname(file.originalname).slice(1).toLowerCase();
            if (!allowedFileTypes.includes(fileExtension)) {
                return cb(new Error(`Invalid File Type! Only ${allowedFileTypes.join(', ')}`), false);
            }
            cb(null, true);
        };

        const upload = multer({
            storage,
            limits: { fileSize: 10 * 1024 * 1024 },
            fileFilter,
        }).fields(fileFields.map(field => ({ name: field, maxCount: maxFiles })));

        upload(req, res, (err) => {
            if (err) {
                if (err instanceof multer.MulterError) {
                    return reject({
                        field: 'limit',
                        message: err.code === 'LIMIT_FILE_SIZE'
                            ? 'File size should not exceed 10 MB.'
                            : err.message
                    });
                }
                return reject({ field: err.field || 'unknown', message: err.message });
            }

            // ✅ Attach file_url to each file
            const result = {};
            if (req.files) {
                for (const field of Object.keys(req.files)) {
                    result[field] = req.files[field].map(file => ({
                        ...file,
                        file_url: `/uploads/${dirName}/${file.filename}`
                    }));
                }
            }

            resolve(result);
        });
    });
};
export const handleFileUpload = (
  dirName,
  fileFields,
  requiredFields = [],
  maxFiles = 10,
  allowedFileTypes = ['png', 'jpeg', 'jpg']
) => {

  // ✅ Create directory if not exists
  const uploadPath = path.join(process.cwd(), "uploads", dirName);

  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }

  // ✅ Storage (LOCAL)
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      cb(null, uniqueName);
    }
  });

  // ✅ File filter
  const fileFilter = (req, file, cb) => {
    const fileExtension = path.extname(file.originalname).slice(1).toLowerCase();

    if (!allowedFileTypes.includes(fileExtension)) {
      return cb(new Error(`Invalid File Type! Only ${allowedFileTypes.join(', ')}`), false);
    }

    cb(null, true);
  };

  const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter,
  });

  return (req, res, next) => {

    const multerFields = fileFields.map(field => ({
      name: field,
      maxCount: maxFiles
    }));

    const uploadMethod = upload.fields(multerFields);

    uploadMethod(req, res, (err) => {

      let errorMsg = {};

      if (err) {
        if (err instanceof multer.MulterError) {
          errorMsg['limit'] =
            err.code === 'LIMIT_FILE_SIZE'
              ? 'File size should not exceed 10 MB.'
              : err.message;
        } else {
          errorMsg[err.field || 'unknown'] = err.message || 'Unknown error';
        }

        return res.status(422).json({
          status: 0,
          code: 422,
          message: errorMsg
        });
      }

      // ✅ Optional: check required fields
      for (const field of requiredFields) {
        if (!req.files || !req.files[field]) {
          return res.status(422).json({
            status: 0,
            code: 422,
            message: { [field]: `${field} is required` }
          });
        }
      }

      // ✅ Add file path to response object
      if (req.files) {
        for (const field of Object.keys(req.files)) {
          req.files[field] = req.files[field].map(file => ({
            ...file,
            file_url: `/uploads/${dirName}/${file.filename}`
          }));
        }
      }

      next();
    });
  };
};

