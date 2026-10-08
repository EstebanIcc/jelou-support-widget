"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Loader2Icon } from "lucide-react";
import * as React from "react";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

const Slottable = Slot.Slottable;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Botón del kit @jelou-ui-2 (clases .jou-btn definidas en app/jou-button.css).
// Convive con components/ui/button.tsx (shadcn); no lo reemplaza.
const buttonVariants = cva("jou-btn", {
    variants: {
        variant: {
            default: "",
            destructive: "jou-btn--destructive",
            "destructive-outline": "jou-btn--destructive-outline",
            outline: "jou-btn--outline",
            ghost: "jou-btn--ghost",
            link: "jou-btn--link",
            warning: "jou-btn--warning",
            secondary: "jou-btn--secondary",
            white: "jou-btn--white",
        },
        size: {
            default: "",
            sm: "jou-btn--sm",
            lg: "jou-btn--lg",
            icon: "jou-btn--icon",
            "icon-sm": "jou-btn--icon-sm",
            "icon-xs": "jou-btn--icon-xs",
            "icon-lg": "jou-btn--icon-lg",
        },
    },
    defaultVariants: {
        variant: "default",
        size: "default",
    },
});

type ButtonSize =
    | "default"
    | "sm"
    | "lg"
    | "icon"
    | "icon-sm"
    | "icon-xs"
    | "icon-lg";
type ButtonVariant =
    | "default"
    | "destructive"
    | "destructive-outline"
    | "outline"
    | "ghost"
    | "link"
    | "warning"
    | "secondary"
    | "white";

type LegacySkinType = "primary" | "secondary" | "terciary";
type LegacySkinColor = "default" | "danger" | "cancel" | "neutral";
type LegacySkin =
    | "neutral"
    | "primary"
    | "danger"
    | "warning"
    | "outlined"
    | "outlined_danger"
    | "transparent";
type LegacySize = "small" | "medium" | "large";

export interface ButtonProps
    extends React.ComponentProps<"button">,
        Omit<VariantProps<typeof buttonVariants>, "size"> {
    asChild?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    iconOnly?: boolean;
    loading?: boolean;
    loadingText?: string;
    width?: string;
    size?: ButtonSize | LegacySize;
    /** @deprecated Use `leftIcon` instead */
    icon?: React.ReactNode;
    /** @deprecated Use `rightIcon` instead */
    secondaryIcon?: React.ReactNode;
    /** @deprecated Use `leftIcon` with custom component instead */
    customIcon?: React.ReactNode;
    /** @deprecated Use `iconOnly` instead */
    isOnlyIcon?: boolean;
    /** @deprecated Use `variant` instead */
    skinType?: LegacySkinType;
    /** @deprecated Use `variant` instead */
    skinColor?: LegacySkinColor;
    /** @deprecated Use `variant` instead */
    skin?: LegacySkin;
}

function mapLegacyPropsToVariant(
    skinType?: LegacySkinType,
    skinColor?: LegacySkinColor,
    skin?: LegacySkin,
): ButtonVariant | undefined {
    if (skin) {
        const skinMap: Record<LegacySkin, ButtonVariant> = {
            primary: "default",
            neutral: "secondary",
            danger: "destructive",
            warning: "warning",
            outlined: "outline",
            outlined_danger: "destructive-outline",
            transparent: "ghost",
        };
        return skinMap[skin];
    }

    if (skinType || skinColor) {
        if (skinColor === "danger") return "destructive";
        if (skinColor === "cancel") return "outline";
        if (skinColor === "neutral") return "secondary";

        if (skinType === "secondary") return "secondary";
        if (skinType === "terciary") return "ghost";

        return "default";
    }

    return undefined;
}

function isLegacySize(size?: string): size is LegacySize {
    return size === "small" || size === "medium" || size === "large";
}

function mapLegacySize(legacySize?: LegacySize): ButtonSize {
    const sizeMap: Record<LegacySize, ButtonSize> = {
        small: "sm",
        medium: "default",
        large: "lg",
    };
    return sizeMap[legacySize ?? "medium"];
}

function warnDeprecatedProp(
    propName: string,
    newPropName: string,
    example?: string,
): void {
    if (!IS_PRODUCTION) {
        const exampleText = example ? ` Example: ${example}` : "";
        console.warn(
            `[Button] "${propName}" is deprecated. Use "${newPropName}" instead.${exampleText}`,
        );
    }
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            className,
            variant,
            size,
            asChild = false,
            leftIcon,
            rightIcon,
            iconOnly,
            loading = false,
            loadingText,
            width,
            children,
            disabled,
            icon,
            secondaryIcon,
            customIcon,
            isOnlyIcon,
            skinType,
            skinColor,
            skin,
            style,
            onClickCapture,
            ...props
        },
        ref,
    ) => {
        React.useEffect(() => {
            if (icon !== undefined) {
                warnDeprecatedProp(
                    "icon",
                    "leftIcon",
                    "<Button leftIcon={<MyIcon />}>",
                );
            }
            if (secondaryIcon !== undefined) {
                warnDeprecatedProp(
                    "secondaryIcon",
                    "rightIcon",
                    "<Button rightIcon={<MyIcon />}>",
                );
            }
            if (customIcon !== undefined) {
                warnDeprecatedProp(
                    "customIcon",
                    "leftIcon",
                    "<Button leftIcon={<MyCustomIcon />}>",
                );
            }
            if (isOnlyIcon !== undefined) {
                warnDeprecatedProp(
                    "isOnlyIcon",
                    "iconOnly",
                    "<Button iconOnly leftIcon={<MyIcon />}>",
                );
            }
            if (skinType !== undefined) {
                warnDeprecatedProp(
                    "skinType",
                    "variant",
                    'skinType="secondary" → variant="secondary"',
                );
            }
            if (skinColor !== undefined) {
                warnDeprecatedProp(
                    "skinColor",
                    "variant",
                    'skinColor="danger" → variant="destructive"',
                );
            }
            if (skin !== undefined) {
                warnDeprecatedProp(
                    "skin",
                    "variant",
                    'skin="primary" → variant="default", skin="danger" → variant="destructive"',
                );
            }
            if (isLegacySize(size)) {
                warnDeprecatedProp(
                    `size="${size}"`,
                    `size="${mapLegacySize(size)}"`,
                    'size="small" → size="sm", size="medium" → size="default", size="large" → size="lg"',
                );
            }
        }, []);

        const resolvedLeftIcon = leftIcon ?? icon ?? customIcon;
        const resolvedRightIcon = rightIcon ?? secondaryIcon;
        const resolvedIconOnly = iconOnly ?? isOnlyIcon ?? false;
        const resolvedVariant =
            variant ?? mapLegacyPropsToVariant(skinType, skinColor, skin);
        const resolvedSize: ButtonSize | undefined = isLegacySize(size)
            ? mapLegacySize(size)
            : (size as ButtonSize | undefined);

        const Comp = asChild ? Slot.Root : "button";

        const iconSize = resolvedSize === "sm" ? "size-[14px]" : "size-[18px]";

        const renderIcon = (iconNode: React.ReactNode) => {
            if (!iconNode) return null;
            if (React.isValidElement(iconNode)) {
                return React.cloneElement(
                    iconNode as React.ReactElement<{ className?: string }>,
                    {
                        className: cn(
                            iconSize,
                            (
                                iconNode as React.ReactElement<{
                                    className?: string;
                                }>
                            ).props.className,
                        ),
                    },
                );
            }
            return iconNode;
        };

        const loadingSpinner = (
            <Loader2Icon
                className={cn("animate-spin", iconSize)}
                aria-hidden="true"
            />
        );

        const isInteractionDisabled = Boolean(disabled || loading);

        const preventSlottedActivation = (event: React.SyntheticEvent) => {
            event.preventDefault();
            event.stopPropagation();
        };

        const hasInertSlottedChild =
            asChild && isInteractionDisabled && React.isValidElement(children);

        const slottedChildren = hasInertSlottedChild
            ? React.cloneElement(
                  children as React.ReactElement<Record<string, unknown>>,
                  {
                      tabIndex: -1,
                      "aria-disabled": true,
                      onClickCapture: preventSlottedActivation,
                      onKeyDownCapture: (event: React.KeyboardEvent) => {
                          if (event.key === "Enter" || event.key === " ") {
                              preventSlottedActivation(event);
                          }
                      },
                  },
              )
            : children;

        return (
            <Comp
                ref={ref}
                type={asChild ? undefined : "button"}
                data-slot="button"
                data-variant={resolvedVariant}
                data-size={resolvedSize}
                disabled={disabled || loading}
                aria-disabled={disabled || loading}
                aria-busy={loading}
                className={cn(
                    buttonVariants({
                        variant: resolvedVariant,
                        size: resolvedSize,
                        className,
                    }),
                )}
                style={{ width, ...style }}
                onClickCapture={
                    hasInertSlottedChild ? undefined : onClickCapture
                }
                {...props}
            >
                {loading ? loadingSpinner : renderIcon(resolvedLeftIcon)}
                {asChild ? (
                    <Slottable>{slottedChildren}</Slottable>
                ) : (
                    !resolvedIconOnly &&
                    (loading && loadingText ? loadingText : children)
                )}
                {!resolvedIconOnly && !loading && renderIcon(resolvedRightIcon)}
            </Comp>
        );
    },
);
Button.displayName = "Button";

export { Button, buttonVariants };
