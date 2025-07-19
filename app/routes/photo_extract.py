from fastapi import APIRouter, Request, Form
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse
import pandas as pd
import json

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

@router.get("/photo-extract")
async def photo_extract_get(request: Request):
    """Главная страница извлечения данных из фото"""
    return templates.TemplateResponse("photo_extract.html", {"request": request})

@router.post("/api/save-photo-data")
async def save_photo_data(request: Request, table_data: str = Form(...)):
    """Сохраняет обработанные данные из фото в сессию"""
    try:
        # Парсим JSON данные
        data = json.loads(table_data)
        
        if not data or 'headers' not in data or 'rows' not in data:
            return JSONResponse({"success": False, "error": "Invalid data format"})
        
        # Создаем DataFrame
        df = pd.DataFrame(data['rows'], columns=data['headers'])
        
        # Пытаемся конвертировать числовые колонки
        for col in df.columns:
            # Пробуем конвертировать в числа
            try:
                # Убираем лишние символы и пробелы
                cleaned = df[col].astype(str).str.replace(r'[^\d\.-]', '', regex=True)
                df[col] = pd.to_numeric(cleaned, errors='ignore')
            except:
                pass
        
        # Сохраняем в сессию (как CSV строку для совместимости)
        csv_string = df.to_csv(index=False)
        
        # Сохраняем временный файл в памяти
        import io
        import tempfile
        import os
        
        # Создаем временный файл
        temp_file = tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False)
        temp_file.write(csv_string)
        temp_file.close()
        
        # Сохраняем путь в сессию
        request.session["data_path"] = temp_file.name
        request.session["data_source"] = "photo"
        
        return JSONResponse({
            "success": True, 
            "message": f"Imported {len(df)} rows with {len(df.columns)} columns",
            "preview": df.head().to_dict('records')
        })
        
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)})

@router.get("/photo-result")
async def photo_result_get(request: Request):
    """Страница результата и корректировки данных"""
    # Проверяем есть ли данные в сессии
    if "data_path" not in request.session:
        return RedirectResponse("/photo-extract", status_code=303)
    
    return templates.TemplateResponse("photo_result.html", {"request": request})