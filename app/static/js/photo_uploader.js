// Дожидаемся полной загрузки DOM
function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element) {
            resolve(element);
            return;
        }

        const observer = new MutationObserver(() => {
            const element = document.querySelector(selector);
            if (element) {
                observer.disconnect();
                resolve(element);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Element ${selector} not found within ${timeout}ms`));
        }, timeout);
    });
}

class PhotoUploader {
    constructor() {
        console.log('PhotoUploader constructor called');
        this.currentImage = null;
        this.extractedData = null;
        
        // Дожидаемся загрузки всех элементов
        this.waitForElements().then(() => {
            this.initializeEventListeners();
        }).catch(error => {
            console.error('Failed to initialize:', error);
        });
    }

    async waitForElements() {
        console.log('Waiting for elements to load...');
        
        try {
            await waitForElement('#photo-input');
            await waitForElement('#extract-btn');
            await waitForElement('#photo-preview');
            await waitForElement('#photo-upload-area');
            await waitForElement('#photo-processing');
            
            console.log('All elements loaded successfully');
        } catch (error) {
            console.error('Element loading failed:', error);
            throw error;
        }
    }

    initializeEventListeners() {
        console.log('Setting up event listeners');
        
        // Photo input
        const photoInput = document.getElementById('photo-input');
        if (photoInput) {
            photoInput.addEventListener('change', (e) => {
                console.log('Photo input change event triggered');
                this.handlePhotoUpload(e.target.files[0]);
            });
            console.log('Photo input listener added');
        } else {
            console.error('photo-input not found!');
        }

        // Extract button
        const extractBtn = document.getElementById('extract-btn');
        if (extractBtn) {
            extractBtn.addEventListener('click', () => {
                console.log('Extract button clicked');
                this.extractData();
            });
            console.log('Extract button listener added');
        } else {
            console.error('extract-btn not found!');
        }

        // Edit button
        const editBtn = document.getElementById('edit-data-btn');
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                this.showEditModal();
            });
        }

        // Import button
        const importBtn = document.getElementById('import-data-btn');
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                this.importData();
            });
        }

        // Restart button
        const restartBtn = document.getElementById('restart-photo-btn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                this.restart();
            });
        }

        // Edit modal buttons
        const cancelBtn = document.getElementById('cancel-edit-btn');
        const saveBtn = document.getElementById('save-edit-btn');
        const addRowBtn = document.getElementById('add-row-btn');
        const addColBtn = document.getElementById('add-col-btn');

        if (cancelBtn) cancelBtn.addEventListener('click', () => this.hideEditModal());
        if (saveBtn) saveBtn.addEventListener('click', () => this.saveEditedData());
        if (addRowBtn) addRowBtn.addEventListener('click', () => this.addTableRow());
        if (addColBtn) addColBtn.addEventListener('click', () => this.addTableColumn());

        console.log('All event listeners set up');
    }

    handlePhotoUpload(file) {
        console.log('handlePhotoUpload called with:', file);
        
        if (!file) {
            console.log('No file provided');
            return;
        }

        console.log('File details:', {
            name: file.name,
            type: file.type,
            size: file.size
        });

        if (!file.type.startsWith('image/')) {
            alert('Please select an image file (JPG, PNG, etc.)');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            alert('File size too large. Please select an image under 10MB');
            return;
        }

        console.log('File is valid, reading...');

        const reader = new FileReader();
        reader.onload = (e) => {
            console.log('File loaded successfully');
            this.currentImage = e.target.result;
            this.showPhotoPreview();
        };
        
        reader.onerror = (e) => {
            console.error('Error reading file:', e);
            alert('Error reading file. Please try again.');
        };
        
        reader.readAsDataURL(file);
    }

    showPhotoPreview() {
        console.log('=== Starting showPhotoPreview ===');
        
        const preview = document.getElementById('photo-preview');
        const uploadArea = document.getElementById('photo-upload-area');
        const processingArea = document.getElementById('photo-processing');
        const extractBtn = document.getElementById('extract-btn');

        console.log('Elements check:', {
            preview: !!preview,
            uploadArea: !!uploadArea, 
            processingArea: !!processingArea,
            extractBtn: !!extractBtn
        });

        if (!preview || !uploadArea || !processingArea || !extractBtn) {
            console.error('Required elements not found for photo preview!');
            return;
        }

        try {
            // Устанавливаем изображение
            console.log('Setting image source...');
            preview.src = this.currentImage;
            console.log('Image source set successfully');
            
            // Показываем preview area, скрываем upload area
            console.log('Switching visibility...');
            uploadArea.classList.add('hidden');
            processingArea.classList.remove('hidden');
            console.log('Visibility switched');
            
            // Включаем кнопку Extract
            console.log('Enabling extract button...');
            extractBtn.disabled = false;
            extractBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            console.log('Extract button enabled');
            
            // Скрываем секции результатов
            const processingStatus = document.getElementById('processing-status');
            const extractionResults = document.getElementById('extraction-results');
            const restartBtn = document.getElementById('restart-photo-btn');
            
            if (processingStatus) processingStatus.classList.add('hidden');
            if (extractionResults) extractionResults.classList.add('hidden');
            if (restartBtn) restartBtn.classList.add('hidden');
            
            console.log('=== showPhotoPreview completed successfully ===');
            
        } catch (error) {
            console.error('Error in showPhotoPreview:', error);
            alert('Error showing photo preview: ' + error.message);
        }
    }

    async extractData() {
        console.log('Starting data extraction');

        if (!this.currentImage) {
            alert('Please select a photo first');
            return;
        }

        // Показываем процесс обработки
        const processingStatus = document.getElementById('processing-status');
        const extractionResults = document.getElementById('extraction-results');
        const restartBtn = document.getElementById('restart-photo-btn');

        if (processingStatus) processingStatus.classList.remove('hidden');
        if (extractionResults) extractionResults.classList.add('hidden');
        if (restartBtn) restartBtn.classList.remove('hidden');

        try {
            await this.runOCR();
        } catch (error) {
            console.error('Extraction error:', error);
            alert('Error extracting data: ' + error.message);
        }
    }

    async runOCR() {
        const updateProgress = (message, percent) => {
            const statusText = document.getElementById('status-text');
            const progressBar = document.getElementById('progress-bar');
            
            if (statusText) statusText.textContent = message;
            if (progressBar) progressBar.style.width = percent + '%';
            
            console.log(`Progress: ${percent}% - ${message}`);
        };

        try {
            updateProgress('Loading OCR engine...', 10);

            const worker = await Tesseract.createWorker({
                logger: m => {
                    console.log('Tesseract:', m);
                    if (m.status === 'recognizing text') {
                        const progress = Math.round(m.progress * 70) + 20;
                        updateProgress(`Recognizing text: ${Math.round(m.progress * 100)}%`, progress);
                    }
                }
            });

            updateProgress('Initializing OCR engine...', 20);
            await worker.loadLanguage('eng');
            await worker.initialize('eng');

            await worker.setParameters({
                tessedit_pageseg_mode: Tesseract.PSM.AUTO,
                tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,-%() |/\t'
            });

            updateProgress('Processing image...', 30);

            const { data: { text } } = await worker.recognize(this.currentImage);
            
            console.log('OCR Text:', text);
            
            updateProgress('Parsing table data...', 90);

            this.extractedData = this.parseTableText(text);
            
            console.log('Parsed data:', this.extractedData);

            updateProgress('Complete!', 100);

            await worker.terminate();

            setTimeout(() => {
                this.showResults();
            }, 500);

        } catch (error) {
            console.error('OCR error:', error);
            throw new Error('OCR processing failed: ' + error.message);
        }
    }

    parseTableText(text) {
        console.log('Parsing text:', text);

        const lines = text.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        console.log('Lines found:', lines.length);

        if (lines.length < 2) {
            throw new Error('Not enough data found in image. Please ensure the table is clearly visible with at least 2 rows.');
        }

        // Пробуем разные стратегии парсинга
        let parsedData = null;

        parsedData = this.tryParseSpaces(lines);
        if (parsedData && parsedData.headers.length > 1) {
            console.log('Parsed with spaces strategy');
            return parsedData;
        }

        parsedData = this.tryParseDelimited(lines, '\t');
        if (parsedData && parsedData.headers.length > 1) {
            console.log('Parsed with tab strategy');
            return parsedData;
        }

        parsedData = this.tryParseDelimited(lines, '|');
        if (parsedData && parsedData.headers.length > 1) {
            console.log('Parsed with pipe strategy');
            return parsedData;
        }

        parsedData = this.tryParseDelimited(lines, ',');
        if (parsedData && parsedData.headers.length > 1) {
            console.log('Parsed with comma strategy');
            return parsedData;
        }

        console.log('Using fallback single column');
        return {
            headers: ['Data'],
            rows: lines.map(line => [line])
        };
    }

    tryParseSpaces(lines) {
        try {
            const rows = lines.map(line => 
                line.split(/\s{2,}/)
                    .map(cell => cell.trim())
                    .filter(cell => cell.length > 0)
            ).filter(row => row.length > 1);

            if (rows.length < 2) return null;

            const maxCols = Math.max(...rows.map(row => row.length));
            
            if (maxCols < 2) return null;

            const normalizedRows = rows.map(row => {
                while (row.length < maxCols) row.push('');
                return row.slice(0, maxCols);
            });

            return {
                headers: normalizedRows[0],
                rows: normalizedRows.slice(1)
            };
        } catch (e) {
            console.log('Spaces parsing failed:', e);
            return null;
        }
    }

    tryParseDelimited(lines, delimiter) {
        try {
            const rows = lines.map(line => 
                line.split(delimiter)
                    .map(cell => cell.trim())
                    .filter(cell => cell.length > 0)
            ).filter(row => row.length > 1);

            if (rows.length < 2) return null;

            const expectedCols = rows[0].length;
            if (expectedCols < 2) return null;

            const validRows = rows.filter(row => row.length >= expectedCols - 1);
            
            if (validRows.length < 2) return null;

            const normalizedRows = validRows.map(row => {
                while (row.length < expectedCols) row.push('');
                return row.slice(0, expectedCols);
            });

            return {
                headers: normalizedRows[0],
                rows: normalizedRows.slice(1)
            };
        } catch (e) {
            console.log(`${delimiter} parsing failed:`, e);
            return null;
        }
    }

    showResults() {
        console.log('Showing results');
        
        const processingStatus = document.getElementById('processing-status');
        const extractionResults = document.getElementById('extraction-results');

        if (processingStatus) processingStatus.classList.add('hidden');
        if (extractionResults) extractionResults.classList.remove('hidden');

        this.displayExtractedTable();
    }

    displayExtractedTable() {
        const container = document.getElementById('extracted-table');
        
        if (!container) {
            console.error('Extracted table container not found!');
            return;
        }
        
        if (!this.extractedData || !this.extractedData.headers || this.extractedData.headers.length === 0) {
            container.innerHTML = '<p class="text-red-600 p-4">No table data could be extracted. Please try a clearer image with a visible table structure.</p>';
            return;
        }

        const table = this.createTableHTML(this.extractedData.headers, this.extractedData.rows, false);
        container.innerHTML = table;
        
        console.log('Table displayed successfully');
    }

    createTableHTML(headers, rows, editable = false) {
        let html = '<table class="w-full border-collapse border border-gray-300 text-sm">';
        
        html += '<thead class="bg-gray-100"><tr>';
        headers.forEach((header, i) => {
            if (editable) {
                html += `<th class="border border-gray-300 p-2">
                    <input type="text" value="${this.escapeHtml(header)}" class="w-full bg-transparent" data-type="header" data-col="${i}">
                </th>`;
            } else {
                html += `<th class="border border-gray-300 p-2 font-bold">${this.escapeHtml(header)}</th>`;
            }
        });
        html += '</tr></thead>';

        html += '<tbody>';
        if (rows && rows.length > 0) {
            rows.forEach((row, rowIndex) => {
                html += '<tr>';
                row.forEach((cell, colIndex) => {
                    if (editable) {
                        html += `<td class="border border-gray-300 p-1">
                            <input type="text" value="${this.escapeHtml(cell || '')}" class="w-full p-1" data-type="cell" data-row="${rowIndex}" data-col="${colIndex}">
                        </td>`;
                    } else {
                        html += `<td class="border border-gray-300 p-2">${this.escapeHtml(cell || '')}</td>`;
                    }
                });
                html += '</tr>';
            });
        } else {
            html += '<tr><td colspan="' + headers.length + '" class="border border-gray-300 p-4 text-center text-gray-500">No data rows found</td></tr>';
        }
        html += '</tbody></table>';
        
        return html;
    }

    escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') {
            unsafe = String(unsafe);
        }
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    showEditModal() {
        const modal = document.getElementById('edit-modal');
        const container = document.getElementById('editable-table-container');
        
        if (!modal || !container) {
            console.error('Edit modal elements not found!');
            return;
        }
        
        const table = this.createTableHTML(this.extractedData.headers, this.extractedData.rows, true);
        container.innerHTML = table;
        
        modal.classList.remove('hidden');
    }

    hideEditModal() {
        const modal = document.getElementById('edit-modal');
        if (modal) modal.classList.add('hidden');
    }

    addTableRow() {
        const container = document.getElementById('editable-table-container');
        const table = container?.querySelector('table tbody');
        
        if (!table) return;
        
        const colCount = this.extractedData.headers.length;
        
        const newRow = document.createElement('tr');
        for (let i = 0; i < colCount; i++) {
            newRow.innerHTML += `<td class="border border-gray-300 p-1">
                <input type="text" value="" class="w-full p-1" data-type="cell" data-row="${this.extractedData.rows.length}" data-col="${i}">
            </td>`;
        }
        table.appendChild(newRow);
        
        this.extractedData.rows.push(new Array(colCount).fill(''));
    }

    addTableColumn() {
        const container = document.getElementById('editable-table-container');
        
        if (!container) return;
        
        const headerRow = container.querySelector('thead tr');
        const newHeader = document.createElement('th');
        newHeader.className = 'border border-gray-300 p-2';
        newHeader.innerHTML = `<input type="text" value="New Column" class="w-full bg-transparent" data-type="header" data-col="${this.extractedData.headers.length}">`;
        headerRow?.appendChild(newHeader);
        
        const bodyRows = container.querySelectorAll('tbody tr');
        bodyRows.forEach((row, rowIndex) => {
            const newCell = document.createElement('td');
            newCell.className = 'border border-gray-300 p-1';
            newCell.innerHTML = `<input type="text" value="" class="w-full p-1" data-type="cell" data-row="${rowIndex}" data-col="${this.extractedData.headers.length}">`;
            row.appendChild(newCell);
        });
        
        this.extractedData.headers.push('New Column');
        this.extractedData.rows.forEach(row => row.push(''));
    }

    saveEditedData() {
        const container = document.getElementById('editable-table-container');
        
        if (!container) return;
        
        const headerInputs = container.querySelectorAll('input[data-type="header"]');
        const newHeaders = Array.from(headerInputs).map(input => input.value.trim());
        
        const cellInputs = container.querySelectorAll('input[data-type="cell"]');
        const newRows = [];
        
        cellInputs.forEach(input => {
            const row = parseInt(input.getAttribute('data-row'));
            const col = parseInt(input.getAttribute('data-col'));
            
            if (!newRows[row]) newRows[row] = [];
            newRows[row][col] = input.value.trim();
        });
        
        this.extractedData.headers = newHeaders;
        this.extractedData.rows = newRows.filter(row => row && row.some(cell => cell));
        
        this.displayExtractedTable();
        this.hideEditModal();
    }

    async importData() {
        if (!this.extractedData || !this.extractedData.headers) {
            alert('No data to import');
            return;
        }

        try {
            const tableData = JSON.stringify({
                headers: this.extractedData.headers,
                rows: this.extractedData.rows || []
            });

            const formData = new FormData();
            formData.append('table_data', tableData);

            const response = await fetch('/api/save-photo-data', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                alert(`Success! ${result.message}`);
                window.location.href = '/';
            } else {
                alert('Error: ' + result.error);
            }
        } catch (error) {
            console.error('Import error:', error);
            alert('Error importing data: ' + error.message);
        }
    }

    restart() {
        console.log('=== RESTART CALLED ===');
        
        this.currentImage = null;
        this.extractedData = null;
        
        const photoInput = document.getElementById('photo-input');
        const uploadArea = document.getElementById('photo-upload-area');
        const processingArea = document.getElementById('photo-processing');
        const extractBtn = document.getElementById('extract-btn');
        
        if (photoInput) photoInput.value = '';
        if (uploadArea) uploadArea.classList.remove('hidden');
        if (processingArea) processingArea.classList.add('hidden');
        if (extractBtn) {
            extractBtn.disabled = true;
            extractBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
        
        this.hideEditModal();
        console.log('=== RESTART COMPLETED ===');
    }
}

// Ждем полной загрузки DOM и Tesseract
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, checking Tesseract...');
    
    const checkTesseract = () => {
        if (typeof Tesseract !== 'undefined') {
            console.log('Tesseract loaded, initializing PhotoUploader');
            new PhotoUploader();
        } else {
            console.log('Tesseract not ready, waiting...');
            setTimeout(checkTesseract, 100);
        }
    };
    
    checkTesseract();
});