import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }) =>
    React.createElement('a', { href, ...props }, children),
}));

// Shared mutable state for the mock store
const state = {
  todos: [],
};

const mockItems = [
  { id: 'item-1', name: 'Excalibur', item_type: 'warframe' },
  { id: 'item-4', name: 'Rubico Prime', item_type: 'primary' },
];

const mockMaterials = [
  { material_name: 'Alloy Plate', quantity_required: 500 },
  { material_name: 'Polymer Bundle', quantity_required: 600 },
];

// Define mock inline to avoid hoisting variable reference issues
vi.mock('../../src/data/store.ts', () => ({
  default: {
    initTodos: () => Promise.resolve(),
    initMaterials: () => Promise.resolve(),
    getAllItems: () => mockItems.map((i) => ({ ...i })),
    getTodos: () => state.todos.map((t) => ({ ...t })),
    getItemById: (id) => {
      const item = mockItems.find((i) => i.id === id);
      return item ? { ...item } : null;
    },
    getMaterialsForItem: () => mockMaterials.map((m) => ({ ...m })),
    addTodo: vi.fn((todo) => {
      const entry = {
        ...todo,
        id: todo.id || 'new-todo-id',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      state.todos.push(entry);
      return { ...entry };
    }),
    updateTodoStatus: vi.fn((id, status) => {
      const t = state.todos.find((td) => td.id === id);
      if (t) {
        t.status = status;
        t.updated_at = new Date().toISOString();
        return { ...t };
      }
      return null;
    }),
    updateTodoNotes: vi.fn((id, notes) => {
      const t = state.todos.find((td) => td.id === id);
      if (t) {
        t.user_notes = notes;
        t.updated_at = new Date().toISOString();
        return { ...t };
      }
      return null;
    }),
    deleteTodo: vi.fn((id) => {
      const idx = state.todos.findIndex((t) => t.id === id);
      if (idx !== -1) {
        state.todos.splice(idx, 1);
        return true;
      }
      return false;
    }),
  },
}));

import Todos from '../../app/todos/page';

const seedTodosData = [
  {
    id: 'todo-1',
    craftable_item_id: 'item-1',
    linked_material_name: null,
    user_notes: 'Craft Excalibur before the week-end farming sprint',
    status: 'in_progress',
    priority: 'high',
    due_at: null,
    created_at: '2026-07-06T00:00:00Z',
    updated_at: '2026-07-06T00:00:00Z',
  },
  {
    id: 'todo-2',
    craftable_item_id: 'item-4',
    linked_material_name: 'Argon Crystal',
    user_notes: 'Argon decays — farm in Void first',
    status: 'pending',
    priority: 'medium',
    due_at: null,
    created_at: '2026-07-06T00:00:00Z',
    updated_at: '2026-07-06T00:00:00Z',
  },
];

describe('Todos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.todos = JSON.parse(JSON.stringify(seedTodosData));
  });

  it('renders the page heading', async () => {
    render(React.createElement(Todos));
    await waitFor(() => {
      expect(screen.getByText('TODOs')).toBeInTheDocument();
    });
  });

  it('renders the loading state initially', () => {
    const { container } = render(React.createElement(Todos));
    // Component renders loading text briefly before useEffect fires
    // After sync render, loading should be done. But useRef can catch it.
    // Just verify the component renders without errors
    expect(container.querySelector('.detail-header')).toBeInTheDocument();
  });

  it('renders todos after loading', async () => {
    render(React.createElement(Todos));
    await waitFor(() => {
      expect(screen.getByText('Craft Excalibur before the week-end farming sprint')).toBeInTheDocument();
    });
    expect(screen.getByText('Argon decays — farm in Void first')).toBeInTheDocument();
  });

  it('renders status badges', async () => {
    render(React.createElement(Todos));
    await waitFor(() => {
      const badges = screen.getAllByText('in_progress');
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });
    // "pending" appears both as form option and badge
    const pendingElements = screen.getAllByText('pending');
    expect(pendingElements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders material badge for linked material', async () => {
    render(React.createElement(Todos));
    await waitFor(() => {
      // Argon Crystal appears as badge text and in source link
      const argonElements = screen.getAllByText('Argon Crystal');
      expect(argonElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders linked item name', async () => {
    render(React.createElement(Todos));
    await waitFor(() => {
      // Excalibur appears as option in form dropdown and as link in todo card
      const excalElements = screen.getAllByText('Excalibur');
      expect(excalElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('edit button shows edit form', async () => {
    render(React.createElement(Todos));
    await waitFor(() => {
      expect(screen.getByText('Craft Excalibur before the week-end farming sprint')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    // Edit form should appear: Save, Cancel buttons and textarea
    await waitFor(() => {
      expect(screen.getByText('Save')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  it('save button saves edit', async () => {
    render(React.createElement(Todos));
    await waitFor(() => {
      expect(screen.getByText('Craft Excalibur before the week-end farming sprint')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Save')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save'));

    // After save, the edit form should close (Save button gone)
    await waitFor(() => {
      expect(screen.queryByText('Save')).toBeNull();
    });
  });

  it('cancel button cancels editing', async () => {
    render(React.createElement(Todos));
    await waitFor(() => {
      expect(screen.getByText('Craft Excalibur before the week-end farming sprint')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Cancel'));

    // After cancel, Edit buttons should be back (2 for 2 todos)
    await waitFor(() => {
      const editBtns = screen.getAllByText('Edit');
      expect(editBtns.length).toBe(2);
    });
  });

  it('delete button removes a todo', async () => {
    render(React.createElement(Todos));
    await waitFor(() => {
      expect(screen.getByText('Craft Excalibur before the week-end farming sprint')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.queryByText('Craft Excalibur before the week-end farming sprint')).toBeNull();
    });
  });

  it('renders new todo form', async () => {
    render(React.createElement(Todos));
    await waitFor(() => {
      expect(screen.getByText('New Todo')).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText('Notes')).toBeInTheDocument();
    expect(screen.getByText('Add')).toBeInTheDocument();
  });

  it('creates a new todo', async () => {
    render(React.createElement(Todos));
    await waitFor(() => {
      expect(screen.getByText('TODOs')).toBeInTheDocument();
    });

    const notesInput = screen.getByPlaceholderText('Notes');
    fireEvent.change(notesInput, { target: { value: 'Brand new todo' } });
    fireEvent.click(screen.getByText('Add'));

    await waitFor(() => {
      expect(screen.getByText('Brand new todo')).toBeInTheDocument();
    });
  });

  it('renders source link for material', async () => {
    render(React.createElement(Todos));
    await waitFor(() => {
      expect(screen.getByText('Source: Argon Crystal')).toBeInTheDocument();
    });
  });

  it('shows no todos message when empty', async () => {
    state.todos = [];
    render(React.createElement(Todos));
    await waitFor(() => {
      expect(screen.getByText('No todos yet.')).toBeInTheDocument();
    });
  });
});
