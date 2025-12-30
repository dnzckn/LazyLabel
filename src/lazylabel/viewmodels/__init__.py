"""ViewModels for LazyLabel MVVM architecture.

ViewModels own application state and emit signals when state changes.
Views (UI) bind to ViewModels and react to changes automatically.
"""

from .single_view_viewmodel import SingleViewViewModel

__all__ = [
    "SingleViewViewModel",
]
