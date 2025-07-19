class PhotoDataExtractor {
    constructor() {
        this.currentImage = null;
        this.extractedData = null;
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // File input
        document.getElementById('photo-input').addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files[0]);
        });

        // Process button
        document.getElementById('process-btn').addEventListener('click', () => {
            this.processImage();
        });

        // Restart buttons
        document.getElementById('restart-btn').addEventListener('click', () => {
            this.restart();
        });
        document.getElementById('restart-final-btn').addEventListener('click', () => {
            this.restart();
        });

        // Edit button
        document.getElementById('edit-btn').addEventListener('click', () => {
            this.showEditModal();
        });

        // Import button
        document.getElementById('import-btn').addEventListener('click', () => {
            this.importData();
        });

        // Edit modal buttons
        document.getElementById('cancel-edit-btn').addEventListener('click', () => {
            this.hideEditModal();
        });
        document.getElementById('save-edit-btn').addEventListener('click', () => {
            this.saveEditedData();
        });
        document.getElementById('add-row-btn').addEventListener('click', () => {
            this.addTableRow();
        });
        document.getElementById('add-col-btn').addEventListener('click', () => {
            this.addTableColumn();
        });
    }

    handleFileUpload(file) {
        if (!file) return;

        // Validate file
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file');
            return;
        }

        if (file.size > 10 * 1024 * 1024) { // 10MB
            alert('File size too large. Please select an image under 10MB');
            return;
        }

        // Create image preview
        const reader = new FileReader();
        reader.onload = (e) => {
            this.currentImage = e.target.result;
            this.showPreview();
        };
        reader.readAsDataURL(file);
    }

    showPreview() {
        const previewImg = document.getElementById('preview-image');
        previewImg.src = this.currentImage;
        
        // Show preview section
        document.getElementById('upload-section').classList.add('hidden');
        document.getElementById('preview-section').classList.remove('hidden');
    }

    async processImage() {
        if (!this.currentImage) {
            alert('Please select an image first');
            return;
        }

        // Show processing section
        document.getElementById('preview-section').classList.add('hidden');
        document.getElementById('processing-section').classList.remove('hidden');

        try {
            // Get processing options
            const options = {
                enhance_contrast: document.getElementById('enhance-contrast').checked,
                denoise: document.getElementById('denoise').checked,
                sharpen: document.getElementById('sharpen').checked,
                language: document.getElementById('ocr-language').value
            };

            await this.runOCR(options);
        } catch (error) {
            console.error('Processing error:', error);
            alert('Error processing image: ' + error.message);
            this.restart();
        }
    }

    async runOCR(options) {
        const updateProgress = (message, percent) => {
            document.getElementById('processing-status').textContent = message;
            document.getElementById('progress-bar').style.width = percent + '%';
            document.getElementById('progress-text').textContent = Math.round(percent) + '%';
        };

        try {
            updateProgress('Loading OCR engine...', 10);

            // Configure Tesseract
            const worker = await Tesseract.createWorker({
                logger: m => {
                    if (m.status === 'recognizing text') {
                        const progress = Math.round(m.progress * 80) + 10; // 10-90%
                        updateProgress(`Processing: ${Math.round(m.progress * 100)}%`, progress);
                    }
                }
            });

            updateProgress('Initializing OCR...', 20);
            await worker.loadLanguage(options.language);
            await worker.initialize(options.language);

            // Configure for table recognition
            await worker.setParameters({
                tessedit_pageseg_mode: Tesseract.PSM.AUTO,
                tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,-%() |'
            });

            updateProgress('Processing image...', 30);

            // Process image
            const { data: { text } } = await worker.recognize(this.currentImage);
            
            updateProgress('Parsing table data...', 90);

            // Parse the extracted text
            this.extractedData = this.parseTableText(text);

            updateProgress('Complete!', 100);

            await worker.terminate();

            // Show results
            setTimeout(() => {
                this.showResults(text);
            }, 500);

        } catch (error) {
            throw new Error('OCR processing failed: ' + error.message);
        }
    }

    parseTableText(text) {
        // Clean up the text
        const lines = text.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        if (lines.length < 2) {
            throw new Error('Not enough data found in image. Please ensure the table is clearly visible.');
        }

        // Try different parsing strategies
        let parsedData = null;

        // Strategy 1: Tab-separated
        parsedData = this.tryParseDelimited(lines, '\t');
        if (parsedData) return parsedData;

        // Strategy 2: Multiple spaces
        parsedData = this.tryParseSpaces(lines);
        if (parsedData) return parsedData;

        // Strategy 3: Pipe-separated
        parsedData = this.tryParseDelimited(lines, '|');
        if (parsedData) return parsedData;

        // Strategy 4: Comma-separated (less likely for tables)
        parsedData = this.tryParseDelimited(lines, ',');
        if (parsedData) return parsedData;

        // Fallback: Single column
        return {
            headers: ['Column1'],
            rows: lines.map(line => [line])
        };
    }

    tryParseDelimited(lines, delimiter) {
        try {
            const rows = lines.map(line => 
                line.split(delimiter)
                    .map(cell => cell.trim())
                    .filter(cell => cell.length > 0)
            ).filter(row => row.length > 1);

            if (rows.length < 2) return null;

            // Check consistency
            const expectedCols = rows[0].length;
            const validRows = rows.filter(row => row.length >= expectedCols - 1);
            
            if (validRows.length < 2) return null;

            // Normalize row lengths
            const normalizedRows = validRows.map(row => {
                while (row.length < expectedCols) row.push('');
                return row.slice(0, expectedCols);
            });

            return {
                headers: normalizedRows[0],
                rows: normalizedRows.slice(1)
            };
        } catch (e) {
            return null;
        }
    }

    tryParseSpaces(lines) {
        try {
            const rows = lines.map(line => 
                line.split(/\s{2,}/)  // Split on 2+ spaces
                    .map(cell => cell.trim())
                    .filter(cell => cell.length > 0)
            ).filter(row => row.length > 1);

            if (rows.length < 2) return null;

            const expectedCols = Math.max(...rows.map(row => row.length));
            
            // Normalize row lengths
            const normalizedRows = rows.map(row => {
                while (row.length < expectedCols) row.push('');
                return row.slice(0, expectedCols);
            });

            return {
                headers: normalizedRows[0],
                rows: normalizedRows.slice(1)
            };
        } catch (e) {
            return null;
        }
    }

    showResults(rawText) {
        // Hide processing, show results
        document.getElementById('processing-section').classList.add('hidden');
        document.getElementById('results-section').classList.remove('hidden');

        // Show raw OCR text
        document.getElementById('raw-ocr-text').value = rawText;

        // Show parsed table
        this.displayParsedTable();
    }

    displayParsedTable() {
        const container = document.getElementById('parsed-table-container');
        
        if (!this.extractedData || !this.extractedData.headers || !this.extractedData.rows) {
            container.innerHTML = '<p class="text-red-600">No table data could be extracted. Please try a clearer image.</p>';
            return;
        }

        const table = this.createTableHTML(this.extractedData.headers, this.extractedData.rows, false);
        container.innerHTML = table;
    }

    createTableHTML(headers, rows, editable = false) {
        let html = '<table class="w-full border-collapse border border-gray-300 text-sm">';
        
        // Headers
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

        // Rows
        html += '<tbody>';
        rows.forEach((row, rowIndex) => {
            html += '<tr>';
            row.forEach((cell, colIndex) => {
                if (editable) {
                    html += `<td class="border border-gray-300 p-1">
                        <input type="text" value="${this.escapeHtml(cell)}" class="w-full p-1" data-type="cell" data-row="${rowIndex}" data-col="${colIndex}">
                    </td>`;
                } else {
                    html += `<td class="border border-gray-300 p-2">${this.escapeHtml(cell)}</td>`;
                }
            });
            html += '</tr>';
        });
        html += '</tbody>';
        
        html += '</table>';
        return html;
    }

    escapeHtml(unsafe) {
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
        
        const table = this.createTableHTML(this.extractedData.headers, this.extractedData.rows, true);
        container.innerHTML = table;
        
        modal.classList.remove('hidden');
    }

    hideEditModal() {
        document.getElementById('edit-modal').classList.add('hidden');
    }

    addTableRow() {
        const container = document.getElementById('editable-table-container');
        const table = container.querySelector('table tbody');
        const colCount = this.extractedData.headers.length;
        
        const newRow = document.createElement('tr');
        for (let i = 0; i < colCount; i++) {
            newRow.innerHTML += `<td class="border border-gray-300 p-1">
                <input type="text" value="" class="w-full p-1" data-type="cell" data-row="${this.extractedData.rows.length}" data-col="${i}">
            </td>`;
        }
        table.appendChild(newRow);
        
        // Update data structure
        this.extractedData.rows.push(new Array(colCount).fill(''));
    }

    addTableColumn() {
        const container = document.getElementById('editable-table-container');
        
        // Add header
        const headerRow = container.querySelector('thead tr');
        const newHeader = document.createElement('th');
        newHeader.className = 'border border-gray-300 p-2';
        newHeader.innerHTML = `<input type="text" value="New Column" class="w-full bg-transparent" data-type="header" data-col="${this.extractedData.headers.length}">`;
        headerRow.appendChild(newHeader);
        
        // Add cells to each row
        const bodyRows = container.querySelectorAll('tbody tr');
        bodyRows.forEach((row, rowIndex) => {
            const newCell = document.createElement('td');
            newCell.className = 'border border-gray-300 p-1';
            newCell.innerHTML = `<input type="text" value="" class="w-full p-1" data-type="cell" data-row="${rowIndex}" data-col="${this.extractedData.headers.length}">`;
            row.appendChild(newCell);
        });
        
        // Update data structure
        this.extractedData.headers.push('New Column');
        this.extractedData.rows.forEach(row => row.push(''));
    }

    saveEditedData() {
        const container = document.getElementById('editable-table-container');
        
        // Get updated headers
        const headerInputs = container.querySelectorAll('input[data-type="header"]');
        const newHeaders = Array.from(headerInputs).map(input => input.value.trim());
        
        // Get updated cell data
        const cellInputs = container.querySelectorAll('input[data-type="cell"]');
        const newRows = [];
        
        cellInputs.forEach(input => {
            const row = parseInt(input.getAttribute('data-row'));
            const col = parseInt(input.getAttribute('data-col'));
            
            if (!newRows[row]) newRows[row] = [];
            newRows[row][col] = input.value.trim();
        });
        
        // Update extracted data
        this.extractedData.headers = newHeaders;
        this.extractedData.rows = newRows.filter(row => row && row.some(cell => cell)); // Remove empty rows
        
        // Update display
        this.displayParsedTable();
        this.hideEditModal();
    }

    async importData() {
        if (!this.extractedData || !this.extractedData.headers || !this.extractedData.rows) {
            alert('No valid data to import');
            return;
        }

        try {
            // Prepare data for server
            const tableData = JSON.stringify({
                headers: this.extractedData.headers,
                rows: this.extractedData.rows
            });

            // Send to server
            const formData = new FormData();
            formData.append('table_data', tableData);

            const response = await fetch('/api/save-photo-data', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                alert(`Success! ${result.message}`);
                // Redirect to plotting
                window.location.href = '/scatter';
            } else {
                alert('Error saving data: ' + result.error);
            }
        } catch (error) {
            alert('Error importing data: ' + error.message);
       }
   }
    restart() {
        // Reset state
        this.currentImage = null;
        this.extractedData = null;
        
        // Reset file input
        document.getElementById('photo-input').value = '';
        
        // Show upload section, hide others
        document.getElementById('upload-section').classList.remove('hidden');
        document.getElementById('preview-section').classList.add('hidden');
        document.getElementById('processing-section').classList.add('hidden');
        document.getElementById('results-section').classList.add('hidden');
        this.hideEditModal();
        
        // Reset progress
        document.getElementById('progress-bar').style.width = '0%';
        document.getElementById('progress-text').textContent = '0%';
    }
    }

    // Initialize when DOM is loaded
    document.addEventListener('DOMContentLoaded', () => {
    new PhotoDataExtractor();
    });
