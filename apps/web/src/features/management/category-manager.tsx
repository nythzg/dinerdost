"use client";
import { Icon } from "@/components/ui";
import type { Row } from "@/lib/client";
import { useDesk } from "../workspace/context";
import {guestCourses,guestMenuCourse} from '../guest/guest-journey';

export function CategoryManager() {
  const { data, form, run } = useDesk();
  const categories: Row[] = data.categories ?? [];
  const edit = (category?: Row) =>
    form(
      category ? "Edit category" : "Add category",
      [{ name: "name", label: "Category name", value: category?.name },
       {name:'menuCourse',label:'Main menu',type:'select',value:category?guestMenuCourse(category.name,category.menu_course):'main',options:guestCourses.map(course=>({value:course.id,label:course.label}))}],
      (values) =>
        run("menuCategory", {
          ...values,
          outletId: data.outletId,
          ...(category ? { id: category.id, version: category.version } : {}),
        }),
    );
  function remove(category: Row) {
    const used = data.menu.some(
      (item: Row) =>
        item.category.toLowerCase() === category.name.toLowerCase(),
    );
    form(
      "Delete " + category.name,
      used
        ? [
            {
              name: "moveTo",
              label: "Move its dishes to",
              type: "select",
              options: categories
                .filter((entry) => entry.id !== category.id)
                .map((entry) => ({ value: entry.id, label: entry.name })),
            },
          ]
        : [],
      (values) =>
        run("menuCategory", {
          ...values,
          mode: "DELETE",
          outletId: data.outletId,
          id: category.id,
          version: category.version,
        }),
      "Delete category",
    );
  }
  return (
    <div className="category-manager">
      <p className="muted">Assign each category to a main menu. Its dishes will appear there in Cashier POS and the customer menu.</p>
      <button className="button primary" onClick={() => edit()}>
        <Icon name="plus" />
        Add category
      </button>
      {categories.length === 0 && (
        <p className="muted">Add your first category.</p>
      )}
      {categories.map((category) => (
        <div className="category-manager-row" key={category.id}>
          <div className="category-manager-name"><strong>{category.name}</strong><small>{guestCourses.find(course=>course.id===guestMenuCourse(category.name,category.menu_course))?.label}</small></div>
          <button
            className="button small"
            aria-label={"Edit " + category.name}
            onClick={() => edit(category)}
          >
            Edit
          </button>
          <button
            className="icon-button danger-text"
            aria-label={"Delete " + category.name}
            onClick={() => remove(category)}
          >
            <Icon name="trash" />
          </button>
        </div>
      ))}
    </div>
  );
}
