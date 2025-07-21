from fastapi import APIRouter, Request, Form
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse, HTMLResponse
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


def create_mobile_boxplot(df, y_column, group_column=None):
    """Создает мобильно-оптимизированный box plot"""
    
    if y_column not in df.columns:
        return "<div class='text-red-500 p-4'>Selected column not found</div>"
    
    # Проверяем что Y колонка числовая
    if not pd.api.types.is_numeric_dtype(df[y_column]):
        return f"<div class='text-red-500 p-4'>Column '{y_column}' is not numeric</div>"
    
    # Создаем box plot
    if group_column and group_column in df.columns and group_column != "":
        # С группировкой
        fig = px.box(df, y=y_column, x=group_column, 
                    template="plotly_dark",
                    title=f"{y_column} distribution by {group_column}")
        
        # Поворачиваем подписи X если они длинные
        fig.update_xaxes(tickangle=45)
    else:
        # Без группировки - один box plot
        fig = px.box(df, y=y_column, 
                    template="plotly_dark",
                    title=f"{y_column} distribution")
    
    # Мобильная оптимизация
    fig.update_layout(
        height=400,  # Фиксированная высота как в scatter
        margin=dict(l=20, r=20, t=50, b=40),
        font=dict(size=12),
        showlegend=False,  # Убираем легенду для экономии места
        title=dict(
            x=0.5,
            font=dict(size=14)
        ),
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
    
    # Мобильная конфигурация (такая же как в scatter)
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


@router.get("/box")
async def box_get(request: Request):
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
    
    # Находим числовые колонки для Y
    numeric_columns = df.select_dtypes(include=['number']).columns.tolist()
    
    # По умолчанию берем первую числовую колонку для Y
    y = numeric_columns[0] if numeric_columns else columns[0]
    group = ""  # По умолчанию нет группировки
    plot_html = ""
    
    if y:
        plot_html = create_mobile_boxplot(df, y, group)

    return templates.TemplateResponse("box.html", {
        "request": request,
        "columns": columns,
        "numeric_columns": numeric_columns,
        "y": y,
        "group": group,
        "plot_html": plot_html
    })


@router.post("/box")
async def box_post(request: Request, y: str = Form(...), group: str = Form("")):
    data_path = request.session.get("data_path")
    gsheet_csv_url = request.session.get("gsheet_csv_url")
    if data_path:
        df = pd.read_csv(data_path)
    elif gsheet_csv_url:
        df = pd.read_csv(gsheet_csv_url)
    else:
        return RedirectResponse("/upload", status_code=303)

    columns = list(df.columns)
    numeric_columns = df.select_dtypes(include=['number']).columns.tolist()
    
    plot_html = create_mobile_boxplot(df, y, group if group else None)

    return templates.TemplateResponse("box.html", {
        "request": request,
        "columns": columns,
        "numeric_columns": numeric_columns,
        "y": y,
        "group": group,
        "plot_html": plot_html
    })