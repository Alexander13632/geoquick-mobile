from fastapi import APIRouter, Request, Form, UploadFile, File
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
import os, shutil
import pandas as pd
import json
import tempfile

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

UPLOAD_DIR = "app/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.get("/upload")
async def upload_get(request: Request):
    return templates.TemplateResponse("upload.html", {"request": request})

@router.post("/upload_local")
async def upload_local(request: Request, datafile: UploadFile = File(...)):
    file_path = os.path.join(UPLOAD_DIR, datafile.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(datafile.file, buffer)
    request.session["data_path"] = file_path
    request.session["data_source"] = "local_file"
    return RedirectResponse("/", status_code=303)

@router.post("/upload_gsheet")
async def upload_gsheet(request: Request, gsheet_url: str = Form(...)):
    if "/edit#gid=" in gsheet_url:
        csv_url = gsheet_url.replace("/edit#gid=", "/export?format=csv&gid=")
    elif "/view#gid=" in gsheet_url:
        csv_url = gsheet_url.replace("/view#gid=", "/export?format=csv&gid=")
    else:
        csv_url = gsheet_url
    request.session["gsheet_csv_url"] = csv_url
    request.session["data_source"] = "google_sheets"
    return RedirectResponse("/", status_code=303)

# Новый endpoint для обработки данных из фото
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
            try:
                # Убираем лишние символы и пробелы
                cleaned = df[col].astype(str).str.replace(r'[^\d\.-]', '', regex=True)
                df[col] = pd.to_numeric(cleaned, errors='ignore')
            except:
                pass
        
        # Сохраняем в сессию как временный файл (для совместимости с существующим кодом)
        temp_file = tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False)
        df.to_csv(temp_file.name, index=False)
        temp_file.close()
        
        # Сохраняем путь в сессию
        request.session["data_path"] = temp_file.name
        request.session["data_source"] = "photo_extract"
        
        return JSONResponse({
            "success": True, 
            "message": f"Imported {len(df)} rows with {len(df.columns)} columns",
            "preview": df.head(3).to_dict('records')
        })
        
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)})
