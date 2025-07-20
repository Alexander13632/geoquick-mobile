class GeochemicalTableExtractor {
    constructor() {
        this.currentImage = null;
        this.extractedData = null;
        this.waitForElements().then(() => {
            this.initializeEventListeners();
        });
    }

    async preprocessForNumbers(imageData) {
        // Предобработка оптимизированная для чисел
        const img = new Image();
        img.src = imageData;
        
        return new Promise((resolve) => {
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Увеличиваем в 2 раза для лучшего распознавания мелких чисел
                const scale = 2;
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                // Получаем данные изображения
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                
                // Конвертируем в черно-белое с порогом оптимизированным для чисел
                for (let i = 0; i < data.length; i += 4) {
                    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                    // Более мягкий порог для сохранения тонких линий цифр
                    const val = avg > 160 ? 255 : 0;
                    data[i] = val;     // R
                    data[i + 1] = val; // G
                    data[i + 2] = val; // B
                }
                
                ctx.putImageData(imageData, 0, 0);
                
                // Легкая резкость для чисел
                ctx.filter = 'contrast(1.4) brightness(1.1)';
                ctx.drawImage(canvas, 0, 0);
                
                resolve(canvas.toDataURL('image/png'));
            };
        });
    }

    async runOCR() {
        const updateProgress = (message, percent) => {
            const statusText = document.getElementById('status-text');
            const progressBar = document.getElementById('progress-bar');
            if (statusText) statusText.textContent = message;
            if (progressBar) progressBar.style.width = percent + '%';
        };

        try {
            updateProgress('Preprocessing image for numbers...', 5);
            
            // Предобработка для чисел
            const processedImage = await this.preprocessForNumbers(this.currentImage);
            
            updateProgress('Loading OCR engine...', 10);

            const worker = await Tesseract.createWorker({
                logger: m => {
                    if (m.status === 'recognizing text') {
                        const progress = Math.round(m.progress * 70) + 20;
                        updateProgress(`Recognizing: ${Math.round(m.progress * 100)}%`, progress);
                    }
                }
            });

            updateProgress('Initializing for numerical data...', 20);
            
            await worker.loadLanguage('eng');
            await worker.initialize('eng');

            // Параметры оптимизированные для геохимических таблиц
            await worker.setParameters({
                tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
                // Whitelist только для нужных символов
                tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-+<> ',
                // Настройки для чисел
                tessedit_ocr_engine_mode: 2,
                preserve_interword_spaces: '1',
                tessedit_create_hocr: '1',
                hocr_font_info: '1'
            });

            updateProgress('Processing numerical table...', 30);

            const { data } = await worker.recognize(processedImage);
            
            console.log('OCR Data:', data);
            
            updateProgress('Analyzing table structure...', 80);

            // Специализированный парсер для геохимических таблиц
            this.extractedData = this.parseGeochemicalTable(data);
            
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

    parseGeochemicalTable(ocrData) {
        // Используем информацию о позициях для точного выравнивания колонок
        const lines = ocrData.lines || [];
        
        if (lines.length < 2) {
            return this.parseTableBySpacing(ocrData.text);
        }

        // Собираем все слова с позициями
        const allWords = [];
        lines.forEach(line => {
            line.words.forEach(word => {
                allWords.push({
                    text: word.text,
                    x: word.bbox.x0,
                    y: word.bbox.y0,
                    x_end: word.bbox.x1,
                    y_end: word.bbox.y1,
                    confidence: word.confidence
                });
            });
        });

        // Фильтруем слова с низкой уверенностью
        const confidentWords = allWords.filter(w => w.confidence > 50);

        // Группируем по строкам (Y координате)
        const rows = this.groupIntoRows(confidentWords);
        
        // Определяем колонки по X позициям
        const tableData = this.alignColumnsForGeochemistry(rows);
        
        return tableData;
    }

    groupIntoRows(words) {
        if (!words.length) return [];
        
        // Сортируем по Y
        words.sort((a, b) => a.y - b.y);
        
        const rows = [];
        let currentRow = [words[0]];
        let currentY = words[0].y;
        
        // Порог для новой строки (высота строки)
        const rowThreshold = 15;
        
        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            
            if (Math.abs(word.y - currentY) > rowThreshold) {
                // Новая строка
                rows.push(currentRow);
                currentRow = [word];
                currentY = word.y;
            } else {
                currentRow.push(word);
            }
        }
        
        if (currentRow.length) {
            rows.push(currentRow);
        }
        
        // Сортируем слова в каждой строке по X
        rows.forEach(row => {
            row.sort((a, b) => a.x - b.x);
        });
        
        return rows;
    }

    alignColumnsForGeochemistry(rows) {
        if (!rows.length) return { headers: [], rows: [] };
        
        // Находим все уникальные X позиции для определения колонок
        const xPositions = [];
        rows.forEach(row => {
            row.forEach(word => {
                xPositions.push(word.x);
            });
        });
        
        // Кластеризуем X позиции для определения колонок
        const columnPositions = this.findColumnPositions(xPositions);
        
        console.log('Detected columns at positions:', columnPositions);
        
        // Создаем выровненную таблицу
        const alignedRows = [];
        
        for (const row of rows) {
            const alignedRow = new Array(columnPositions.length).fill('');
            
            for (const word of row) {
                // Находим ближайшую колонку
                let minDist = Infinity;
                let colIndex = 0;
                
                for (let i = 0; i < columnPositions.length; i++) {
                    const dist = Math.abs(word.x - columnPositions[i]);
                    if (dist < minDist) {
                        minDist = dist;
                        colIndex = i;
                    }
                }
                
                // Порог для принадлежности к колонке
                if (minDist < 50) {
                    // Проверяем, не число ли это
                    const cleanedText = this.cleanNumberText(word.text);
                    alignedRow[colIndex] = cleanedText;
                }
            }
            
            alignedRows.push(alignedRow);
        }
        
        // Убираем пустые строки
        const nonEmptyRows = alignedRows.filter(row => 
            row.some(cell => cell.trim().length > 0)
        );
        
        if (nonEmptyRows.length < 2) {
            return { headers: ['Data'], rows: [[ocrData.text]] };
        }
        
        // Первая строка - заголовки (обычно названия элементов)
        const headers = nonEmptyRows[0];
        const dataRows = nonEmptyRows.slice(1);
        
        // Валидация и очистка числовых данных
        const cleanedRows = dataRows.map(row => 
            row.map((cell, idx) => {
                // Первая колонка часто содержит ID образца
                if (idx === 0) return cell;
                
                // Остальные колонки должны быть числами
                return this.validateGeochemicalValue(cell);
            })
        );
        
        return {
            headers: headers,
            rows: cleanedRows
        };
    }

    findColumnPositions(xPositions) {
        if (!xPositions.length) return [];
        
        // Сортируем позиции
        xPositions.sort((a, b) => a - b);
        
        // Минимальное расстояние между колонками
        const minColumnGap = 30;
        
        const columns = [xPositions[0]];
        let lastColumnX = xPositions[0];
        
        for (let i = 1; i < xPositions.length; i++) {
            if (xPositions[i] - lastColumnX > minColumnGap) {
                columns.push(xPositions[i]);
                lastColumnX = xPositions[i];
            }
        }
        
        return columns;
    }

    cleanNumberText(text) {
        // Очистка текста для чисел
        let cleaned = text.trim();
        
        // Исправляем частые ошибки OCR в числах
        cleaned = cleaned
            .replace(/[oO]/g, '0')  // O -> 0
            .replace(/[lI]/g, '1')  // l,I -> 1
            .replace(/[sS]/g, '5')  // s -> 5 (в некоторых шрифтах)
            .replace(/[zZ]/g, '2')  // z -> 2 (редко)
            .replace(/\s+/g, '')    // Убираем пробелы внутри чисел
            .replace(/,/g, '.');    // Запятая -> точка для десятичных
        
        return cleaned;
    }

    validateGeochemicalValue(value) {
        // Валидация и очистка геохимических значений
        const cleaned = this.cleanNumberText(value);
        
        // Проверяем, похоже ли на число
        if (/^[<>]?\d*\.?\d+$/.test(cleaned)) {
            return cleaned;
        }
        
        // Проверяем на "ниже предела обнаружения"
        if (cleaned.toLowerCase().includes('bd') || cleaned === '-') {
            return '<0.01';  // Стандартное обозначение
        }
        
        // Если не число и не специальное значение, возвращаем как есть
        return cleaned;
    }

    // Альтернативный парсер для таблиц без четкой структуры
    parseTableBySpacing(text) {
        console.log('Parsing table by spacing analysis');
        
        const lines = text.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
        
        if (lines.length < 2) {
            return { headers: ['Data'], rows: [[text]] };
        }
        
        // Анализируем структуру пробелов для определения колонок
        const parsedRows = [];
        
        for (const line of lines) {
            // Ищем группы символов разделенные множественными пробелами
            const cells = [];
            const matches = line.match(/\S+/g) || [];
            
            let currentCell = '';
            let lastEnd = 0;
            
            for (let i = 0; i < line.length; i++) {
                if (line[i] !== ' ') {
                    currentCell += line[i];
                } else if (currentCell) {
                    // Проверяем количество пробелов после текущей ячейки
                    let spaceCount = 0;
                    let j = i;
                    while (j < line.length && line[j] === ' ') {
                        spaceCount++;
                        j++;
                    }
                    
                    // Если больше 2 пробелов, считаем новой ячейкой
                    if (spaceCount > 2) {
                        cells.push(this.cleanNumberText(currentCell));
                        currentCell = '';
                        i = j - 1;
                    } else if (spaceCount === 1) {
                        // Один пробел может быть внутри числа
                        currentCell += ' ';
                    }
                }
            }
            
            if (currentCell) {
                cells.push(this.cleanNumberText(currentCell));
            }
            
            if (cells.length > 0) {
                parsedRows.push(cells);
            }
        }
        
        // Нормализуем количество колонок
        const maxCols = Math.max(...parsedRows.map(row => row.length));
        const normalizedRows = parsedRows.map(row => {
            while (row.length < maxCols) row.push('');
            return row;
        });
        
        // Валидация для геохимических данных
        const headers = normalizedRows[0];
        const dataRows = normalizedRows.slice(1).map(row =>
            row.map((cell, idx) => {
                if (idx === 0) return cell; // ID образца
                return this.validateGeochemicalValue(cell);
            })
        );
        
        return {
            headers: headers,
            rows: dataRows
        };
    }

    // Метод для постобработки таблицы
    postProcessGeochemicalTable(tableData) {
        if (!tableData || !tableData.headers) return tableData;
        
        // Определяем какие колонки должны быть числовыми
        const numericColumns = [];
        
        tableData.headers.forEach((header, idx) => {
            // Типичные названия элементов в геохимии
            const elementPattern = /^(SiO2|TiO2|Al2O3|Fe2O3|FeO|MnO|MgO|CaO|Na2O|K2O|P2O5|LOI|Total|Cr|Ni|Co|V|Cu|Pb|Zn|Rb|Sr|Y|Zr|Nb|Ba|La|Ce|Nd|Sm|Eu|Gd|Dy|Er|Yb|Lu|Hf|Ta|Th|U)$/i;
            
            if (elementPattern.test(header.trim())) {
                numericColumns.push(idx);
            }
        });
        
        // Очищаем числовые колонки
        tableData.rows = tableData.rows.map(row => 
            row.map((cell, idx) => {
                if (numericColumns.includes(idx)) {
                    return this.validateGeochemicalValue(cell);
                }
                return cell;
            })
        );
        
        return tableData;
    }

    // Остальные методы остаются без изменений...
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
        
        const photoInput = document.getElementById('photo-input');
        if (photoInput) {
            photoInput.addEventListener('change', (e) => {
                console.log('Photo input change event triggered');
                this.handlePhotoUpload(e.target.files[0]);
            });
        }

        const extractBtn = document.getElementById('extract-btn');
        if (extractBtn) {
            extractBtn.addEventListener('click', () => {
                console.log('Extract button clicked');
                this.extractData();
            });
        }

        const editBtn = document.getElementById('edit-data-btn');
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                this.showEditModal();
            });
        }

        const importBtn = document.getElementById('import-data-btn');
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                this.importData();
            });
        }

        const restartBtn = document.getElementById('restart-photo-btn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                this.restart();
            });
        }

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

        if (!preview || !uploadArea || !processingArea || !extractBtn) {
            console.error('Required elements not found for photo preview!');
            return;
        }

        try {
            preview.src = this.currentImage;
            uploadArea.classList.add('hidden');
            processingArea.classList.remove('hidden');
            extractBtn.disabled = false;
            extractBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            
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

    async runOCRWithValidation() {
        const updateProgress = (message, percent) => {
            const statusText = document.getElementById('status-text');
            const progressBar = document.getElementById('progress-bar');
            if (statusText) statusText.textContent = message;
            if (progressBar) progressBar.style.width = percent + '%';
        };

        try {
            // Шаг 1: Предобработка на клиенте
            updateProgress('Preprocessing image...', 5);
            const processedImage = await this.preprocessForNumbers(this.currentImage);
            
            // Шаг 2: OCR на клиенте
            updateProgress('Running OCR...', 20);
            
            const worker = await Tesseract.createWorker({
                logger: m => {
                    if (m.status === 'recognizing text') {
                        const progress = Math.round(m.progress * 50) + 20;
                        updateProgress(`Recognizing: ${Math.round(m.progress * 100)}%`, progress);
                    }
                }
            });

            await worker.loadLanguage('eng');
            await worker.initialize('eng');
            
            await worker.setParameters({
                tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
                tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-+<> ',
                preserve_interword_spaces: '1',
                tessedit_create_hocr: '1'
            });

            const { data } = await worker.recognize(processedImage);
            await worker.terminate();
            
            updateProgress('Parsing table structure...', 70);
            
            // Шаг 3: Первичный парсинг на клиенте
            const preliminaryData = this.parseGeochemicalTable(data);
            
            // Шаг 4: Отправка на сервер для валидации
            updateProgress('Validating data on server...', 85);
            
            const validatedData = await this.validateOnServer({
                raw_text: data.text,
                lines: data.lines?.map(line => ({
                    y: line.bbox.y0,
                    words: line.words.map(word => ({
                        text: word.text,
                        x: word.bbox.x0,
                        confidence: word.confidence
                    }))
                })),
                preliminary_data: preliminaryData
            });
            
            if (validatedData.success) {
                this.extractedData = validatedData.data;
                updateProgress('Complete!', 100);
                
                setTimeout(() => {
                    this.showResults();
                }, 500);
            } else {
                // Используем локальные данные если сервер недоступен
                console.warn('Server validation failed, using local data');
                this.extractedData = preliminaryData;
                updateProgress('Complete (local processing)', 100);
                
                setTimeout(() => {
                    this.showResults();
                }, 500);
            }
            
        } catch (error) {
            console.error('OCR error:', error);
            throw new Error('OCR processing failed: ' + error.message);
        }
    }

    async validateOnServer(ocrData) {
        try {
            const response = await fetch('/api/process-table-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(ocrData)
            });
            
            if (!response.ok) {
                throw new Error('Server validation failed');
            }
            
            return await response.json();
            
        } catch (error) {
            console.error('Server validation error:', error);
            // Возвращаем ошибку, но не прерываем процесс
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Опциональное улучшение изображения на сервере
    async enhanceImageOnServer() {
        if (!this.currentImage) return this.currentImage;
        
        try {
            const response = await fetch(this.currentImage);
            const blob = await response.blob();
            
            const formData = new FormData();
            formData.append('file', blob, 'image.png');
            
            const serverResponse = await fetch('/api/enhance-image', {
                method: 'POST',
                body: formData
            });
            
            const result = await serverResponse.json();
            
            if (result.success) {
                return result.enhanced_image;
            }
        } catch (error) {
            console.error('Image enhancement failed:', error);
        }
        
        // Возвращаем оригинал если улучшение не удалось
        return this.currentImage;
    }



// Обновите метод extractData в вашем photo_uploader.js

    async extractData() {
        console.log('Starting data extraction');

        if (!this.currentImage) {
            alert('Please select a photo first');
            return;
        }

        const processingStatus = document.getElementById('processing-status');
        const extractionResults = document.getElementById('extraction-results');
        const restartBtn = document.getElementById('restart-photo-btn');

        if (processingStatus) processingStatus.classList.remove('hidden');
        if (extractionResults) extractionResults.classList.add('hidden');
        if (restartBtn) restartBtn.classList.remove('hidden');

        try {
            // Используем метод с валидацией вместо базового runOCR
            await this.runOCRWithValidation();
        } catch (error) {
            console.error('Extraction error:', error);
            alert('Error extracting data: ' + error.message);
        }
    }

// Также добавьте эти вспомогательные методы если их еще нет:

// Метод для проверки доступности сервера
    async checkServerAvailability() {
        try {
            const response = await fetch('/api/process-table-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ test: true })
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    // Обновленный метод showResults с индикацией метода обработки
    showResults() {
        console.log('Showing results');
        
        const processingStatus = document.getElementById('processing-status');
        const extractionResults = document.getElementById('extraction-results');

        if (processingStatus) processingStatus.classList.add('hidden');
        if (extractionResults) extractionResults.classList.remove('hidden');

        // Показываем, использовалась ли серверная валидация
        const validationInfo = document.createElement('div');
        validationInfo.className = 'mb-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700';
        validationInfo.innerHTML = `
            <span class="font-semibold">Processing method:</span> 
            ${this.extractedData._validated ? 'Client OCR + Server validation ✓' : 'Client OCR only'}
        `;
        
        const container = document.getElementById('extracted-table');
        if (container && container.parentNode) {
            container.parentNode.insertBefore(validationInfo, container);
        }

        this.displayExtractedTable();
    }

    // Добавьте маркер валидации в runOCRWithValidation:
    // (обновите существующий метод)
    async validateOnServer(ocrData) {
        try {
            const response = await fetch('/api/process-table-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(ocrData)
            });
            
            if (!response.ok) {
                throw new Error('Server validation failed');
            }
            
            const result = await response.json();
            
            // Добавляем маркер что данные прошли валидацию
            if (result.success && result.data) {
                result.data._validated = true;
            }
            
            return result;
            
        } catch (error) {
            console.error('Server validation error:', error);
            return {
                success: false,
                error: error.message
            };
        }
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
                    <input type="text" value="${this.escapeHtml(header)}" class="w-full bg-transparent font-bold" data-type="header" data-col="${i}">
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
                    // Подсветка числовых значений
                    const isNumeric = /^[<>]?\d*\.?\d+$/.test(cell);
                    const cellClass = isNumeric ? 'text-blue-600 font-mono' : '';
                    
                    if (editable) {
                        html += `<td class="border border-gray-300 p-1">
                            <input type="text" value="${this.escapeHtml(cell || '')}" class="w-full p-1 ${cellClass}" data-type="cell" data-row="${rowIndex}" data-col="${colIndex}">
                        </td>`;
                    } else {
                        html += `<td class="border border-gray-300 p-2 ${cellClass}">${this.escapeHtml(cell || '')}</td>`;
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
        newHeader.innerHTML = `<input type="text" value="New Element" class="w-full bg-transparent font-bold" data-type="header" data-col="${this.extractedData.headers.length}">`;
        headerRow?.appendChild(newHeader);
        
        const bodyRows = container.querySelectorAll('tbody tr');
        bodyRows.forEach((row, rowIndex) => {
            const newCell = document.createElement('td');
            newCell.className = 'border border-gray-300 p-1';
            newCell.innerHTML = `<input type="text" value="" class="w-full p-1" data-type="cell" data-row="${rowIndex}" data-col="${this.extractedData.headers.length}">`;
            row.appendChild(newCell);
        });
        
        this.extractedData.headers.push('New Element');
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
        
        // Повторная валидация данных
        this.extractedData = this.postProcessGeochemicalTable(this.extractedData);
        
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
                window.location.href = '/scatter';
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

// Helper function
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

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, checking Tesseract...');
    
    const checkTesseract = () => {
        if (typeof Tesseract !== 'undefined') {
            console.log('Tesseract loaded, initializing GeochemicalTableExtractor');
            new GeochemicalTableExtractor();
        } else {
            console.log('Tesseract not ready, waiting...');
            setTimeout(checkTesseract, 100);
        }
    };
    
    checkTesseract();
});