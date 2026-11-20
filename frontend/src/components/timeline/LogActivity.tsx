import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useLogActivity, type ActivityTarget } from "@/api/activities";
import type { LoggableType } from "@/api/types";
import { Field, fieldAria, showSaveError } from "@/components/forms/FormDialog";
import { activitySchema, type ActivityValues } from "@/components/forms/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { localInputToUtc, nowLocalInput } from "@/lib/dates";
import { messages } from "@/lib/words";
import { TypePicker } from "./TypePicker";

const FIELDS = ["type", "description", "occurred_at", "follow_up_date"] as const;

function fresh(type: LoggableType = "note"): ActivityValues {
  return { type, description: "", occurred_at: nowLocalInput(), follow_up_date: "" };
}

/** How often an untouched "When" catches up with the clock. */
const WHEN_REFRESH_MS = 5_000;

/** The "Log activity" box at the top of a timeline (ACT-1). */
export function LogActivity({ target, idPrefix }: { target: ActivityTarget; idPrefix: string }) {
  const log = useLogActivity();
  const form = useForm<ActivityValues>({ resolver: zodResolver(activitySchema), defaultValues: fresh() });
  const { register, handleSubmit, reset, setError, setValue, getValues, control, formState } = form;
  const errors = formState.errors;
  const type = useWatch({ control, name: "type" }) as LoggableType;

  // "When" starts as now and keeps up with the clock until it's changed by
  // hand, so a page left open through a call doesn't log the call at the time
  // the page was opened (ACT-1).
  const [whenChanged, setWhenChanged] = useState(false);
  useEffect(() => {
    if (whenChanged) return;
    const timer = setInterval(() => {
      const now = nowLocalInput();
      if (getValues("occurred_at") !== now) setValue("occurred_at", now);
    }, WHEN_REFRESH_MS);
    return () => clearInterval(timer);
  }, [whenChanged, getValues, setValue]);

  const onSubmit = handleSubmit((values) => {
    log.mutate(
      {
        target,
        input: {
          type: values.type as LoggableType,
          description: values.description.trim(),
          occurred_at: localInputToUtc(values.occurred_at),
          follow_up_date: values.follow_up_date || null,
        },
      },
      {
        onSuccess: () => {
          toast.success(messages.logged);
          setWhenChanged(false);
          reset(fresh(values.type as LoggableType));
        },
        onError: (error) => showSaveError(error, setError, FIELDS),
      },
    );
  });

  return (
    <form noValidate onSubmit={onSubmit} aria-label="Log activity" className="grid gap-3 rounded-xl bg-page p-4">
      <TypePicker value={type} onChange={(next) => setValue("type", next)} />
      <Field
        id={`${idPrefix}-description`}
        label="What happened?"
        required
        error={errors.description?.message}
        hideLabel
      >
        <Textarea
          {...fieldAria(`${idPrefix}-description`, errors.description?.message)}
          placeholder="What happened?"
          rows={3}
          {...register("description")}
        />
      </Field>
      <div className="flex flex-wrap items-end gap-3">
        <Field id={`${idPrefix}-when`} label="When" required error={errors.occurred_at?.message}>
          <Input
            {...fieldAria(`${idPrefix}-when`, errors.occurred_at?.message)}
            type="datetime-local"
            className="w-[210px]"
            {...register("occurred_at", {
              onChange: () => setWhenChanged(true),
            })}
          />
        </Field>
        <Field id={`${idPrefix}-follow-up`} label="Follow-up date" error={errors.follow_up_date?.message}>
          <Input
            {...fieldAria(`${idPrefix}-follow-up`, errors.follow_up_date?.message)}
            type="date"
            className="w-[170px]"
            {...register("follow_up_date")}
          />
        </Field>
        <Button type="submit" className="ml-auto" disabled={log.isPending}>
          Log activity
        </Button>
      </div>
    </form>
  );
}
