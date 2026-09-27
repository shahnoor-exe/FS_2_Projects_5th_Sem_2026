import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { apiClient, ApiError } from '../../api/client.js';
import { Input } from '../common/Input.js';
import { Button } from '../common/Button.js';

export const OrganizationSettingsView: React.FC = () => {
  const { currentOrganization, refreshProfile } = useAuth();
  const { success, error: toastError } = useToast();

  const [name, setName] = useState(currentOrganization?.name || '');
  const [slug, setSlug] = useState(currentOrganization?.slug || '');
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrganization) {
      setName(currentOrganization.name);
      setSlug(currentOrganization.slug);
    }
  }, [currentOrganization]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('Organization name cannot be empty');
      return;
    }

    try {
      setIsLoading(true);
      await apiClient.patch('/organizations/current', {
        name: name.trim(),
        slug: slug.trim() || undefined,
      });

      success('Organization profile updated');
      await refreshProfile();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to update organization';
      setFormError(msg);
      toastError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div id="settings-view" style={{ maxWidth: '640px' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Organization Settings</h1>
          <p className="page-subtitle">Configure organization profile, slug, and tenant properties</p>
        </div>
      </div>

      <div className="glass-card">
        {formError && (
          <div className="toast toast-error" style={{ marginBottom: '1.5rem', width: '100%' }}>
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} id="org-settings-form">
          <Input
            id="settings-org-name"
            data-testid="settings-org-name"
            label="Organization Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <Input
            id="settings-org-slug"
            data-testid="settings-org-slug"
            label="Organization Slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            helperText="Lowercase alphanumeric with hyphens (e.g. acme-corp)"
            required
          />

          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              id="save-org-settings-btn"
              data-testid="save-org-settings-btn"
              type="submit"
              variant="primary"
              isLoading={isLoading}
            >
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
