from fastapi import APIRouter, Request, Form, UploadFile, File
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
import os, shutil

router = APIRouter()

templates = Jinja2Templates(directory="app/templates")

UPLOAD_DIR = "app/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload_local")
async def upload_local(request: Request, datafile: UploadFile = File(...)):
    file_path = os.path.join(UPLOAD_DIR, datafile.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(datafile.file, buffer)
    request.session["data_path"] = file_path
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
    return RedirectResponse("/", status_code=303)

@router.get("/upload")
async def upload_get(request: Request):
    return templates.TemplateResponse("upload.html", {"request": request})
