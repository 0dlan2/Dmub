// uploader.js
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const previewContainer = document.getElementById('preview-container');
const uploadForm = document.getElementById('upload-form');
const progressBar = document.getElementById('progress-bar');
const progress = document.getElementById('progress');
const feedback = document.getElementById('feedback');

let files = [];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

// ======================
// DRAG & DROP HANDLERS
// ======================
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover');
});
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  handleFiles(e.dataTransfer.files);
});

// ======================
// FILE INPUT HANDLER
// ======================
fileInput.addEventListener('change', () => {
  handleFiles(fileInput.files);
  fileInput.value = ''; // Reset input for same file re-selection
});

function handleFiles(selectedFiles) {
  Array.from(selectedFiles).forEach(file => {
    if (file.size > MAX_FILE_SIZE) {
      showError(`File too large: ${file.name} (${formatSize(file.size)})`);
      return;
    }
    
    if (!files.some(f => f.name === file.name && f.size === file.size)) {
      files.push(file);
      createPreview(file);
    }
  });
}

// ======================
// PREVIEW MANAGEMENT
// ======================
function createPreview(file) {
  const previewItem = document.createElement('div');
  previewItem.className = 'preview-item';
  previewItem.dataset.fileName = file.name;

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-btn';
  removeBtn.innerHTML = '&times;';
  removeBtn.onclick = () => removeFile(file, previewItem);

  const content = createMediaElement(file);
  previewItem.append(content, removeBtn);
  previewContainer.appendChild(previewItem);
}

function createMediaElement(file) {
  const url = URL.createObjectURL(file);
  const element = file.type.startsWith('image/') 
    ? createImageElement(url)
    : file.type.startsWith('video/')
    ? createVideoElement(url)
    : createGenericElement(file);

  return element;
}

function removeFile(file, element) {
  files = files.filter(f => f !== file);
  element.remove();
  URL.revokeObjectURL(element.querySelector('img, video')?.src);
}

// ======================
// UPLOAD HANDLER
// ======================
uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const uploadChannel = document.getElementById('uploadChannel').value.trim();
  const resultChannel = document.getElementById('resultChannel').value.trim();

  if (!validateInputs(uploadChannel, resultChannel)) return;

  try {
    const response = await uploadFiles(uploadChannel, resultChannel);
    handleSuccess(response);
  } catch (error) {
    handleError(error);
  }
});

async function uploadFiles(uploadChannel, resultChannel) {
  showProgress('Uploading...', 'yellow');

  const formData = new FormData();
  formData.append('uploadChannel', uploadChannel);
  formData.append('resultChannel', resultChannel);
  files.forEach(file => formData.append('mediaFiles', file));

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://dmub-production.up.railway.app/upload-media');

    // Progress handler
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        updateProgress(percent);
      }
    });

    // Response handler
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response);
      } else {
        reject(xhr.responseText || 'Upload failed');
      }
    };

    xhr.onerror = () => reject('Network error');
    xhr.send(formData);
  });
}

// ======================
// UI HELPERS
// ======================
function validateInputs(uploadChannel, resultChannel) {
  if (!uploadChannel || !resultChannel) {
    showError('Please enter both channel IDs');
    return false;
  }
  
  if (files.length === 0) {
    showError('Please select files to upload');
    return false;
  }
  
  return true;
}

function showProgress(message, color) {
  feedback.textContent = message;
  feedback.style.color = color;
  progressBar.style.display = 'block';
  progress.style.width = '0%';
}

function updateProgress(percent) {
  progress.style.width = `${percent}%`;
  feedback.textContent = `Uploading... ${percent}%`;
}

function handleSuccess() {
  showProgress('Upload complete!', 'green');
  setTimeout(() => {
    progressBar.style.display = 'none';
    feedback.textContent = '';
  }, 2000);
  
  // Reset form
  files = [];
  previewContainer.innerHTML = '';
  uploadForm.reset();
}

function handleError(error) {
  console.error('Upload error:', error);
  showProgress(`Error: ${error}`, 'red');
  setTimeout(() => {
    progressBar.style.display = 'none';
    feedback.textContent = '';
  }, 5000);
}

function showError(message) {
  feedback.textContent = message;
  feedback.style.color = 'red';
  setTimeout(() => feedback.textContent = '', 5000);
}

function formatSize(bytes) {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Byte';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i)) + ' ' + sizes[i];
}

// ======================
// ELEMENT CREATORS
// ======================
function createImageElement(url) {
  const img = document.createElement('img');
  img.src = url;
  return img;
}

function createVideoElement(url) {
  const video = document.createElement('video');
  video.src = url;
  video.controls = true;
  return video;
}

function createGenericElement(file) {
  const div = document.createElement('div');
  div.className = 'file-info';
  div.innerHTML = `
    <span class="file-name">${file.name}</span>
    <span class="file-size">${formatSize(file.size)}</span>
  `;
  return div;
}
