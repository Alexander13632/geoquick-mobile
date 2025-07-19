from fastapi import APIRouter, Request, Form
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse, HTMLResponse
import pandas as pd
import plotly.express as px

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


def create_mobile_plot(df, x, y, color=None):
    if color and color in df.columns:
        fig = px.scatter(df, x=x, y=y, color=color, template="plotly_dark")
    else:
        fig = px.scatter(df, x=x, y=y, template="plotly_dark")
    
    # Мобильная оптимизация
    fig.update_layout(
        height=400,  # Фиксированная высота
        margin=dict(l=20, r=20, t=40, b=40),
        font=dict(size=12),
        showlegend=True if color else False,
        legend=dict(
            orientation="h",  # Горизонтальная легенда
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1
        ) if color else {},
        # ВАЖНО: автоматическое масштабирование
        autosize=True,
        # Убираем возможность выделения области
        dragmode=False,
    )
    
    # Настройки осей для мобильных
    fig.update_xaxes(
        fixedrange=True,  # Запрещаем зум по X
        automargin=True
    )
    fig.update_yaxes(
        fixedrange=True,  # Запрещаем зум по Y  
        automargin=True
    )
    
    # Мобильная конфигурация
    config = {
        "displayModeBar": False,  # Убираем панель инструментов
        "responsive": True,       # Адаптивный размер
        "doubleClick": False,     # Отключаем двойной клик
        "scrollZoom": False,      # Отключаем зум скроллом
        "showTips": False,        # Убираем подсказки
        "staticPlot": False,      # Оставляем интерактивность для hover
        "displaylogo": False,     # Убираем логотип Plotly
        # Отключаем все взаимодействия кроме hover
        "modeBarButtonsToRemove": [
            'pan2d', 'select2d', 'lasso2d', 'zoomIn2d', 'zoomOut2d',
            'autoScale2d', 'resetScale2d', 'zoom2d'
        ]
    }
    
    return fig.to_html(full_html=False, config=config)

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
    color = ""  # По умолчанию нет группировки
    plot_html = ""
    
    if x and y:
        plot_html = create_mobile_plot(df, x, y, color)

    return templates.TemplateResponse("scatter.html", {
        "request": request,
        "columns": columns,
        "x": x,
        "y": y,
        "color": color,
        "plot_html": plot_html
    })

@router.post("/scatter")
async def scatter_post(request: Request, x: str = Form(...), y: str = Form(...), color: str = Form("")):
    data_path = request.session.get("data_path")
    gsheet_csv_url = request.session.get("gsheet_csv_url")
    if data_path:
        df = pd.read_csv(data_path)
    elif gsheet_csv_url:
        df = pd.read_csv(gsheet_csv_url)
    else:
        return RedirectResponse("/upload", status_code=303)

    columns = list(df.columns)
    plot_html = create_mobile_plot(df, x, y, color if color else None)

    return templates.TemplateResponse("scatter.html", {
        "request": request,
        "columns": columns,
        "x": x,
        "y": y,
        "color": color,
        "plot_html": plot_html
    })
