/*
 * FaceCapture - Google Apps Script
 *
 * SETUP:
 * 1. Go to https://script.google.com > New project
 * 2. Delete the default code, paste this entire file
 * 3. Replace YOUR_FOLDER_ID below with your Google Drive folder ID
 *    (open the folder in Drive, the ID is the last part of the URL)
 * 4. Click Deploy > New deployment
 * 5. Type: Web app
 * 6. Execute as: Me
 * 7. Who has access: Anyone
 * 8. Deploy, then copy the URL
 * 9. Paste that URL in the FaceCapture app Settings
 *
 * FOLDER STRUCTURE IT CREATES:
 *   YourFolder/
 *     P00120260622/
 *       P00120260622_front.jpg
 *       P00120260622_right.jpg
 *       P00120260622_left.jpg
 *       P00120260622_back.jpg
 *     P00220260622/
 *       ...
 */

const ROOT_FOLDER_ID = 'YOUR_FOLDER_ID';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const { patientId, angle, image } = data;

    if (!patientId || !angle || !image) {
      return respond({ error: 'Missing fields' });
    }

    const root = DriveApp.getFolderById(ROOT_FOLDER_ID);

    // Find or create patient folder
    let folder;
    const folders = root.getFoldersByName(patientId);
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = root.createFolder(patientId);
    }

    // Delete old version if re-uploading same angle
    const filename = patientId + '_' + angle + '.jpg';
    const existing = folder.getFilesByName(filename);
    while (existing.hasNext()) {
      existing.next().setTrashed(true);
    }

    // Save new photo
    const blob = Utilities.newBlob(Utilities.base64Decode(image), 'image/jpeg', filename);
    const file = folder.createFile(blob);

    return respond({ success: true, fileId: file.getId(), fileName: filename });

  } catch (err) {
    return respond({ error: err.toString() });
  }
}

function doGet() {
  return respond({ status: 'running', service: 'FaceCapture Upload' });
}

function respond(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
