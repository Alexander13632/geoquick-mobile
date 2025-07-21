from fastapi import APIRouter, Request, Form
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse, HTMLResponse
import pandas as pd
import plotly.express as px

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


def create_mobile_plot(df, x, y, color=None, log_x=False, log_y=False, x_range=None, y_range=None):
    if color and color in df.columns:
        fig = px.scatter(df, x=x, y=y, color=color, template="plotly_white")
    else:
        fig = px.scatter(df, x=x, y=y, template="plotly_white")
    
    # Мобильная оптимизация с белым фоном
    fig.update_layout(
        height=400,  # Фиксированная высота
        margin=dict(l=60, r=30, t=50, b=60),  # Увеличены отступы для осей
        font=dict(size=12, color='black'),
        showlegend=True if color else False,
        legend=dict(
            orientation="h",  # Горизонтальная легенда
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1,
            font=dict(color='black')
        ) if color else {},
        # Белый фон
        plot_bgcolor='white',
        paper_bgcolor='white',
        # ВАЖНО: автоматическое масштабирование
        autosize=True,
        # Убираем возможность выделения области
        dragmode=False,
    )
    
    # Настройки осей с сеткой и видимыми линиями
    fig.update_xaxes(
        fixedrange=True,  # Запрещаем зум по X
        automargin=True,
        showline=True,    # Показываем линию оси
        linewidth=2,      # Толщина линии оси
        linecolor='black', # Цвет линии оси
        showgrid=True,    # Показываем сетку
        gridwidth=1,      # Толщина линий сетки
        gridcolor='lightgray',  # Цвет сетки
        showticklabels=True,    # Показываем подписи
        tickcolor='black',      # Цвет насечек
        tickwidth=2,           # Толщина насечек
        ticks='outside',       # Насечки снаружи
        tickfont=dict(color='black', size=11),
        title_font=dict(color='black', size=12),
        type='log' if log_x else 'linear',  # Логарифмический масштаб
        range=x_range if x_range else None  # Пользовательский диапазон X
    )
    fig.update_yaxes(
        fixedrange=True,  # Запрещаем зум по Y  
        automargin=True,
        showline=True,    # Показываем линию оси
        linewidth=2,      # Толщина линии оси
        linecolor='black', # Цвет линии оси
        showgrid=True,    # Показываем сетку
        gridwidth=1,      # Толщина линий сетки
        gridcolor='lightgray',  # Цвет сетки
        showticklabels=True,    # Показываем подписи
        tickcolor='black',      # Цвет насечек
        tickwidth=2,           # Толщина насечек
        ticks='outside',       # Насечки снаружи
        tickfont=dict(color='black', size=11),
        title_font=dict(color='black', size=12),
        type='log' if log_y else 'linear',  # Логарифмический масштаб
        range=y_range if y_range else None  # Пользовательский диапазон Y
    )
    
    # Обновляем цвета точек для лучшей видимости на белом фоне
    if not color:
        fig.update_traces(marker=dict(
            color='#2E86C1',  # Синий цвет вместо стандартного
            size=8,
            opacity=0.7,
            line=dict(width=1, color='white')  # Белая обводка
        ))
    
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
    log_x = False  # По умолчанию линейный масштаб
    log_y = False  # По умолчанию линейный масштаб
    
    # Диапазоны по умолчанию - пустые
    x_min = ""
    x_max = ""
    y_min = ""
    y_max = ""
    
    plot_html = ""
    
    if x and y:
        plot_html = create_mobile_plot(df, x, y, color, log_x, log_y)

    return templates.TemplateResponse("scatter.html", {
        "request": request,
        "columns": columns,
        "x": x,
        "y": y,
        "color": color,
        "log_x": log_x,
        "log_y": log_y,
        "x_min": x_min,
        "x_max": x_max,
        "y_min": y_min,
        "y_max": y_max,
        "plot_html": plot_html
    })


@router.post("/scatter")
async def scatter_post(request: Request, 
                      x: str = Form(...), 
                      y: str = Form(...), 
                      color: str = Form(""),
                      log_x: bool = Form(False),
                      log_y: bool = Form(False),
                      x_min: str = Form(""),
                      x_max: str = Form(""),
                      y_min: str = Form(""),
                      y_max: str = Form("")):
    data_path = request.session.get("data_path")
    gsheet_csv_url = request.session.get("gsheet_csv_url")
    if data_path:
        df = pd.read_csv(data_path)
    elif gsheet_csv_url:
        df = pd.read_csv(gsheet_csv_url)
    else:
        return RedirectResponse("/upload", status_code=303)

    columns = list(df.columns)
    
    # Обработка диапазонов
    x_range = None
    y_range = None
    
    # Парсим X диапазон
    try:
        x_min_val = float(x_min.strip()) if x_min.strip() else None
        x_max_val = float(x_max.strip()) if x_max.strip() else None
        
        if x_min_val is not None or x_max_val is not None:
            x_range = [x_min_val, x_max_val]
    except ValueError:
        pass  # Игнорируем неверные значения
    
    # Парсим Y диапазон
    try:
        y_min_val = float(y_min.strip()) if y_min.strip() else None
        y_max_val = float(y_max.strip()) if y_max.strip() else None
        
        if y_min_val is not None or y_max_val is not None:
            y_range = [y_min_val, y_max_val]
    except ValueError:
        pass  # Игнорируем неверные значения
    
    plot_html = create_mobile_plot(df, x, y, color if color else None, log_x, log_y, x_range, y_range)

    return templates.TemplateResponse("scatter.html", {
        "request": request,
        "columns": columns,
        "x": x,
        "y": y,
        "color": color,
        "log_x": log_x,
        "log_y": log_y,
        "x_min": x_min,
        "x_max": x_max,
        "y_min": y_min,
        "y_max": y_max,
        "plot_html": plot_html
    })