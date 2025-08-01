from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from app.routes import upload, scatter, box, img2table_extract

app = FastAPI()

app.add_middleware(SessionMiddleware, secret_key="supersecret")

app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/about", response_class=HTMLResponse)
async def about(request: Request):
    return templates.TemplateResponse("about.html", {"request": request})

# Подключаем все роуты
app.include_router(upload.router)
app.include_router(scatter.router)
app.include_router(box.router)
app.include_router(img2table_extract.router)

# Для отладки - добавим простой тестовый роут
@app.get("/test")
async def test():
    return {"message": "FastAPI working"}