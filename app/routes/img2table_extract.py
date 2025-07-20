from fastapi import APIRouter, Request, UploadFile, File
from fastapi.responses import JSONResponse
import cv2
import numpy as np
import tempfile
import pandas as pd
import os
import platform

router = APIRouter()

# Кроссплатформенная настройка Tesseract
def setup_tesseract():
    if platform.system() == "Windows":
        import pytesseract
        # Локально на Windows
        tesseract_path = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
        if os.path.exists(tesseract_path):
            pytesseract.pytesseract.tesseract_cmd = tesseract_path
        else:
            print("Tesseract not found at default Windows location")
    # На Linux (Render) tesseract будет в PATH автоматически

# Инициализация
setup_tesseract()

try:
    from img2table.document import Image
    from img2table.ocr import TesseractOCR
    
    ocr = TesseractOCR(n_threads=1, lang="eng")
    IMG2TABLE_AVAILABLE = True
    print("✅ img2table + tesseract initialized successfully")
except Exception as e:
    print(f"❌ img2table not available: {e}")
    IMG2TABLE_AVAILABLE = False

@router.post("/api/img2table-extract")
async def extract_with_img2table(request: Request, file: UploadFile = File(...)):
    """Извлечение таблиц с помощью img2table + tesseract"""
    
    if not IMG2TABLE_AVAILABLE:
        return JSONResponse({
            "success": False, 
            "error": "img2table not available on this system"
        })
    
    try:
        # Читаем изображение
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if image is None:
            return JSONResponse({"success": False, "error": "Invalid image format"})
        
        # Сохраняем временно изображение
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as temp_file:
            cv2.imwrite(temp_file.name, image)
            
            # Создаем Image объект
            img_doc = Image(temp_file.name)
            
            # Извлекаем таблицы с настройками для научных таблиц
            extracted_tables = img_doc.extract_tables(
                ocr=ocr, 
                implicit_rows=True,      # Важно для таблиц без всех линий
                borderless_tables=True,  # Поддержка таблиц без границ
                min_confidence=30        # Понижаем порог для научных таблиц
            )
            
            if not extracted_tables:
                return JSONResponse({"success": False, "error": "No tables detected"})
            
            # Берем первую найденную таблицу
            table = extracted_tables[0]
            df = table.df
            
            if df.empty:
                return JSONResponse({"success": False, "error": "Empty table extracted"})
            
            # Очищаем и обрабатываем данные
            df = df.dropna(how='all').reset_index(drop=True)
            
            # Убираем пустые колонки
            df = df.loc[:, df.any()]
            
            # Подготавливаем данные
            headers = df.columns.tolist()
            rows = df.values.tolist()
            
            # Сохраняем в сессию
            temp_csv = tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False)
            df.to_csv(temp_csv.name, index=False)
            temp_csv.close()
            
            request.session["data_path"] = temp_csv.name
            request.session["data_source"] = "img2table"
            
            # Очищаем временный файл
            os.unlink(temp_file.name)
            
            return JSONResponse({
                "success": True,
                "message": f"Extracted {len(rows)} rows with {len(headers)} columns",
                "preview": {"headers": headers, "rows": rows[:5]},
                "method": "img2table + tesseract",
                "tables_found": len(extracted_tables)
            })
            
    except Exception as e:
        print(f"img2table error details: {e}")
        return JSONResponse({"success": False, "error": f"img2table error: {str(e)}"})