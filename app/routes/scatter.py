from fastapi import APIRouter, Request, Form
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse, HTMLResponse
import pandas as pd
import plotly.express as px

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

@router.get("/scatter")
async def scatter_get(request: Request):
    # Загружаем данные из сессии
    data_path = request.session.get("data_path")
    gsheet_csv_url = request.session.get("gsheet_csv_url")
    if data_path:
        df = pd.read_csv(data_path)
    elif gsheet_csv_url:
        df = pd.read_csv(gsheet_csv_url)
    else:
        return RedirectResponse("/upload", status_code=303)

    columns = list(df.columns)
    x = columns[0] if columns else ""
    y = columns[1] if len(columns) > 1 else ""
    plot_html = ""
    if x and y:
        fig = px.scatter(df, x=x, y=y, template="plotly_dark")
        plot_html = fig.to_html(full_html=False, config={"displayModeBar": False})

    return templates.TemplateResponse("scatter.html", {
        "request": request,
        "columns": columns,
        "x": x,
        "y": y,
        "plot_html": plot_html
    })

@router.post("/scatter")
async def scatter_post(request: Request, x: str = Form(...), y: str = Form(...)):
    data_path = request.session.get("data_path")
    gsheet_csv_url = request.session.get("gsheet_csv_url")
    if data_path:
        df = pd.read_csv(data_path)
    elif gsheet_csv_url:
        df = pd.read_csv(gsheet_csv_url)
    else:
        return RedirectResponse("/upload", status_code=303)

    columns = list(df.columns)
    fig = px.scatter(df, x=x, y=y, template="plotly_dark")
    plot_html = fig.to_html(full_html=False, config={"displayModeBar": False})

    return templates.TemplateResponse("scatter.html", {
        "request": request,
        "columns": columns,
        "x": x,
        "y": y,
        "plot_html": plot_html
    })

# This code defines a FastAPI router for handling scatter plot requests.
