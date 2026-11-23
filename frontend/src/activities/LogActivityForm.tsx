import { useEffect, useState } from "react";
import { useForm, useWatch, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Phone, StickyNote } from "lucide-react";
import { Field, FormActions, FormError, fieldProps } from "../shared/Field";
import { applyServerErrors, errorMessages } from "../shared/forms";
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
type ActivityType = Values["type"];

/** A fresh form, for logging the next activity. */
function blankActivity(type: ActivityType): Values {
  return { type, description: "", occurred_on: localToday(), follow_up_on: "", done: false };
}

function entryValues(entry: TimelineEntry): Values {
  return {
    type: entry.type ?? "call",
    description: entry.description ?? "",
    occurred_on: entry.occurred_on ?? localToday(),
    follow_up_on: entry.follow_up_on ?? "",
    done: entry.done ?? false,
  };
}

function activityBody(values: Values, editing: boolean, on: Props["on"]) {
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
  return body;
}

type TypeChoiceProps = {
  prefix: string;
  registration: UseFormRegisterReturn;
  error?: string;
};

/** A labelled segmented choice, so it reads as picking a type rather than as action buttons (TM02). */
function TypeChoice({ prefix, registration, error }: TypeChoiceProps) {
  return (
    <>
      <div className="field type-field">
        <span className="label" id={`${prefix}-type-label`}>
          Type
        </span>
        <div className="type-choice" role="radiogroup" aria-labelledby={`${prefix}-type-label`}>
          {TYPES.map(({ key, label, icon: Icon }) => (
            <label key={key}>
              <input type="radio" value={key} {...registration} />
              <Icon size={15} aria-hidden="true" />
              {label}
            </label>
          ))}
        </div>
      </div>
      {error && <span className="field error">{error}</span>}
    </>
  );
}

type EditExtrasProps = {
  hasFollowUp: boolean;
  doneRegistration: UseFormRegisterReturn;
  doneError?: string;
  submitting: boolean;
  onCancel?: () => void;
};

/** When editing: ticking off the follow-up, then Save and Cancel. */
function EditExtras({
  hasFollowUp,
  doneRegistration,
  doneError,
  submitting,
  onCancel,
}: EditExtrasProps) {
  return (
    <>
      {hasFollowUp && (
        <label className="check">
          <input type="checkbox" {...doneRegistration} /> Follow-up done
        </label>
      )}
      {doneError && <span className="field error">{doneError}</span>}
      <FormActions submitLabel="Save activity" submitting={submitting} onCancel={onCancel} />
    </>
  );
}

/** A3: type, description and an optional follow-up, filled in and saved with the keyboard alone. */
export function LogActivityForm({ on, entry, onSaved, onCancel }: Props) {
  const toast = useToast();
  const save = useSaveActivity();
  const [formError, setFormError] = useState<string | null>(null);
  const editing = entry !== undefined;
  const prefix = editing ? "edit-activity" : "log-activity";
  const {
    register,
    handleSubmit,
    setError,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: entry ? entryValues(entry) : blankActivity("call"),
  });
  const errorOf = errorMessages(errors);
  const followUp = useWatch({ control, name: "follow_up_on" });
  // Each successful log gets a new object, so the effect below runs once per log.
  const [justLogged, setJustLogged] = useState<{ type: ActivityType } | null>(null);

  // After logging, clear the form for the next one, keeping the type, and put the cursor back.
  useEffect(() => {
    if (!justLogged) return;
    reset(blankActivity(justLogged.type));
    window.requestAnimationFrame(() => document.getElementById(`${prefix}-description`)?.focus());
  }, [justLogged, prefix, reset]);

  const onSubmit = async (values: Values) => {
    setFormError(null);
    try {
      await save.mutateAsync({ id: entry?.id, body: activityBody(values, editing, on) });
      if (editing) {
        toast.success("Activity saved.");
      } else {
        toast.success(
          values.follow_up_on ? "Activity logged, with a follow-up." : "Activity logged.",
        );
        setJustLogged({ type: values.type });
      }
      onSaved?.();
    } catch (error) {
      setFormError(applyServerErrors(error, setError, FIELDS));
    }
  };

  return (
    <form
      className={editing ? undefined : "panel log-form"}
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      aria-label={editing ? "Edit activity" : "Log activity"}
    >
      <FormError message={formError} />
      {!editing && <h2 className="sr-only">Log activity</h2>}
      <TypeChoice prefix={prefix} registration={register("type")} error={errorOf("type")} />
      <div className={editing ? undefined : "log-row"}>
        <Field
          id={`${prefix}-description`}
          label="What happened"
          required
          error={errorOf("description")}
        >
          <input
            {...fieldProps(`${prefix}-description`, errorOf("description"))}
            {...register("description")}
            placeholder={editing ? undefined : "For example: agreed pricing for 3 sites"}
            autoComplete="off"
          />
        </Field>
        <Field id={`${prefix}-follow-up`} label="Follow-up date" error={errorOf("follow_up_on")}>
          <input
            type="date"
            {...fieldProps(`${prefix}-follow-up`, errorOf("follow_up_on"))}
            {...register("follow_up_on")}
          />
        </Field>
        <Field id={`${prefix}-occurred`} label="Date" required error={errorOf("occurred_on")}>
          <input
            type="date"
            {...fieldProps(`${prefix}-occurred`, errorOf("occurred_on"))}
            {...register("occurred_on")}
          />
        </Field>
        {editing ? (
          <EditExtras
            hasFollowUp={Boolean(followUp)}
            doneRegistration={register("done")}
            doneError={errorOf("done")}
            submitting={isSubmitting}
            onCancel={onCancel}
          />
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
