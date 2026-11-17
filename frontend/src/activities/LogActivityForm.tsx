import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Phone, StickyNote } from "lucide-react";
import { Field, fieldProps } from "../shared/Field";
import { applyServerErrors } from "../shared/forms";
import { useToast } from "../shared/Toast";
import { localToday } from "../shared/today";
import { activityFormSchema, orNull, type ActivityFormValues } from "../shared/validation";
import { useSaveActivity, type TimelineEntry } from "./hooks";

const TYPES = [
  { key: "call", label: "Call", icon: Phone },
  { key: "email", label: "Email", icon: Mail },
  { key: "note", label: "Note", icon: StickyNote },
] as const;

const FIELDS = ["type", "description", "occurred_on", "follow_up_on", "done"] as const;

type Props = {
  /** The record it's logged on, when adding. */
  on?: { contactId?: number; dealId?: number };
  /** The entry being edited. */
  entry?: TimelineEntry;
  onSaved?: () => void;
  onCancel?: () => void;
};

type Values = ActivityFormValues;

/** A3: type, description and an optional follow-up, filled in and saved with the keyboard alone. */
export function LogActivityForm({ on, entry, onSaved, onCancel }: Props) {
  const toast = useToast();
  const save = useSaveActivity();
  const [formError, setFormError] = useState<string | null>(null);
  const editing = entry !== undefined;
  const prefix = editing ? "edit-activity" : "log-activity";
  const defaults: Values = {
    type: entry?.type ?? "call",
    description: entry?.description ?? "",
    occurred_on: entry?.occurred_on ?? localToday(),
    follow_up_on: entry?.follow_up_on ?? "",
    done: entry?.done ?? false,
  };
  const {
    register,
    handleSubmit,
    setError,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: defaults,
  });
  const followUp = useWatch({ control, name: "follow_up_on" });
  const lastType = useRef(defaults.type);
  const [logged, setLogged] = useState(0);

  // After logging, clear the form for the next one and put the cursor back.
  useEffect(() => {
    if (logged === 0) return;
    reset({ ...defaults, type: lastType.current, description: "", follow_up_on: "", occurred_on: localToday() });
    window.requestAnimationFrame(() => document.getElementById(`${prefix}-description`)?.focus());
    // Runs only after each successful log.
  }, [logged]);

  const onSubmit = async (values: Values) => {
    setFormError(null);
    const body: Record<string, unknown> = {
      type: values.type,
      description: values.description.trim(),
      occurred_on: values.occurred_on,
      follow_up_on: orNull(values.follow_up_on),
    };
    if (editing) body.done = values.follow_up_on ? values.done : false;
    else {
      body.contact_id = on?.contactId ?? null;
      body.deal_id = on?.dealId ?? null;
    }
    try {
      await save.mutateAsync({ id: entry?.id, body });
      if (editing) {
        toast.success("Activity saved.");
      } else {
        toast.success(values.follow_up_on ? "Activity logged, with a follow-up." : "Activity logged.");
        lastType.current = values.type;
        setLogged((n) => n + 1);
      }
      onSaved?.();
    } catch (error) {
      setFormError(applyServerErrors(error, setError, FIELDS));
    }
  };

  const e = errors;
  return (
    <form
      className={editing ? undefined : "panel log-form"}
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      aria-label={editing ? "Edit activity" : "Log activity"}
    >
      {formError && (
        <div className="form-error" role="alert">
          {formError}
        </div>
      )}
      {!editing && <h2 className="sr-only">Log activity</h2>}
      <div className="type-choice" role="radiogroup" aria-label="Type">
        {TYPES.map(({ key, label, icon: Icon }) => (
          <label key={key}>
            <input type="radio" value={key} {...register("type")} />
            <Icon size={15} aria-hidden="true" />
            {label}
          </label>
        ))}
      </div>
      {e.type && <span className="field error">{e.type.message}</span>}
      <div className={editing ? undefined : "log-row"}>
        <Field id={`${prefix}-description`} label="What happened" required error={e.description?.message}>
          <input
            {...fieldProps(`${prefix}-description`, e.description?.message)}
            {...register("description")}
            placeholder={editing ? undefined : "For example: agreed pricing for 3 sites"}
            autoComplete="off"
          />
        </Field>
        <Field id={`${prefix}-follow-up`} label="Follow-up date" error={e.follow_up_on?.message}>
          <input type="date" {...fieldProps(`${prefix}-follow-up`, e.follow_up_on?.message)} {...register("follow_up_on")} />
        </Field>
        <Field id={`${prefix}-occurred`} label="Date" required error={e.occurred_on?.message}>
          <input type="date" {...fieldProps(`${prefix}-occurred`, e.occurred_on?.message)} {...register("occurred_on")} />
        </Field>
        {editing ? (
          <>
            {followUp && (
              <label className="check">
                <input type="checkbox" {...register("done")} /> Follow-up done
              </label>
            )}
            {e.done && <span className="field error">{e.done.message}</span>}
            <div className="form-actions">
              <button type="submit" className="btn" disabled={isSubmitting}>
                Save activity
              </button>
              <button type="button" className="btn ghost" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <div className="field">
            <button type="submit" className="btn" disabled={isSubmitting}>
              Log activity
            </button>
          </div>
        )}
      </div>
    </form>
  );
}
